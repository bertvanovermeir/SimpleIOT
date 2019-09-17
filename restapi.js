/////////////////
// SERVER SIDE //
/////////////////

///////////////
// VARIABLES //
///////////////

//json variables
const fs = require('fs');
var dataPath = "data.json";

// init the global JSON DATA variable
var JDATA = readData();

//other variables
var express = require('express');
var app = express();
app.set('port', process.env.PORT || getSetting("websrv_port"));
var http = require('http').createServer(app);
var mqtt = require('mqtt');
var bodyParser = require('body-parser');
var io = require('socket.io').listen(http);
// use this express app for all connections on the port and start server
app.use(express['static'](__dirname));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MQTT variables
var messageReceived = false;

///////////////
// FUNCTIONS //
///////////////

// read data from file
function readData() {
    let rawdata = fs.readFileSync(dataPath);
    let jsondata = JSON.parse(rawdata);
    return jsondata;
}

// write data back to file
function writeData(jsondata) {
    let data = JSON.stringify(jsondata, null, 2);
    fs.writeFileSync(dataPath, data);
}

// generate a GUID for devices or zones
function getUniqueName() {
    return Math.random().toString(36).substr(2, 9);
}

// add a device to the JSON object and save it
function addDevice(path, name, type, description, image) {
    device = new Object();
    device["path"] = path;
    device["name"] = name;
    device["type"] = type;
    device["description"] = description;
    device["image"] = image;
    device["lastseen"] = "null";
    device["state"] = "null";
    let guid = getUniqueName();
    device["guid"] = guid;

    JDATA.devices[guid] = device;
    JDATA.devices["amount"] = JDATA.devices.amount + 1;
    JDATA.devices.list.push(guid);

    writeData(JDATA);
}

// remove a device from the JSON object and save it
function removeDevice(guid) {
    delete JDATA.devices[guid];
    let list = JDATA.devices.list
    // remove the guid from the listing
    for (var i = 0; i < list.length; i++) {
        if (list[i] == guid) {
            list.splice(i, 1);
            JDATA.devices.amount = JDATA.devices.amount - 1;
        }
    }
    JDATA.devices.list = list;
    writeData(JDATA);
}

// add a zone to the JSON object and save it
function addZone(name, description, command, image, devices) {
    zone = new Object();
    zone["name"] = name;
    zone["description"] = description;
    zone["command"] = command;
    zone["image"] = image;
    zone["devices"] = devices;
    let guid = getUniqueName();
    zone["guid"] = guid;

    JDATA.zones[guid] = zone;
    JDATA.zones["amount"] = JDATA.zones.amount + 1;
    JDATA.zones.list.push(guid);

    writeData(JDATA);
}

// remove a zone from the JSON object and save it
function removeZone(guid) {
    delete JDATA.zones[guid]
    let list = JDATA.zones.list
    // remove the guid from the listing
    for (var i = 0; i < list.length; i++) {
        if (list[i] == guid) {
            list.splice(i, 1);
            JDATA.zones.amount = JDATA.zones.amount - 1;
        }
    }
    JDATA.zones.list = list;
    writeData(JDATA);
}

// get all devices as a JSON object
function getDevices() {
    return JDATA.devices;
}

// get all zones as a JSON object
function getZones() {
    return JDATA.zones;
}

// get a zone by GUID
function getZone(guid) {
    return JDATA.zones[guid];
}

// get a device by GUID
function getDevice(guid) {
    return JDATA.devices[guid];
}

// update a device using the GUID
function updateDevice(guid, key, value) {
    device = JDATA.devices[guid];
    device[key] = value;
    JDATA.devices[guid] = device;
    writeData(JDATA);
}

// update a zone using the GUID
function updateZone(guid, key, value) {
    zone = JDATA.zones[guid];
    zone[key] = value;
    JDATA.zones[guid] = zone;
    writeData(JDATA);
}

// update a setting in JSON and save
function updateSetting(key, value) {
    JDATA.settings[key] = value;
    writeData(JDATA);
}

// get a setting from JSON
function getSetting(key) {
    return JDATA.settings[key];
}

////////////////////
// MQTT FUNCTIONS //
////////////////////

// send an MQTT request to the server. The request type can be of
// the following types (at this time): STATUS, COMMAND, OTHER 
function sendMQTTRequest(requestType, devicePath, command) {
    if (messageReceived == false) {
        var options = {
            qos: 1
        };
        if (requestType == "STATUS") {
            // if status then the actual payload should be empty (command variable will be ignored)
            // this will (usually) result in the devices replying with their current status.
            MQTTCONN.publish("cmnd/" + devicePath, " ", options);
        }
        if (requestType == "COMMAND") {
            // if command then the actual payload should be a command like ON or OFF
            MQTTCONN.publish("cmnd/" + devicePath, command, options);
        }
        if (requestType == "OTHER") {
            // if other then simply publish a message to the broker, nothing else
            MQTTCONN.publish(devicePath, command, options);
        }
    } else {
        console.log("Recommended: wait for a reply before sending next payload")
    }
}

// upon incoming message, process the reponse below and update the JSON data.
// warn the client that update is imminent through socket.io
// this method is dependent on type of devices, you should adapt it when you want to use it yourself
function processMQTTResponse(topic, message) {
    // two msg are always sent with same content but different formatting for sonoff devices.    
    // check the topic, if it contains "result", drop the message
    if (topic.toLowerCase().includes("result")) {
        // drop the message
    } else {
        getDevices().list.forEach(guid => {
            let device = getDevice(guid);
            if (device.path.toLowerCase() == topic.toLowerCase().replace("stat/","")) {
                updateDevice(guid,"state",message.toString()); // convert from buffer instance
                alertClientDeviceUpdated(guid);
            }
        });
    }
}

// alert the client an update was processed, 
function alertClientDeviceUpdated(guid) {
    io.emit(getSetting("socket_emit"), {
        id: guid
    });
}

//////////
// INIT //
//////////

// init MQTT connection
// start a connection to mqtt broker
var MQTTCONN = mqtt.connect("mqtt://" + getSetting("mqtt_server"), {
    clientID: getSetting("mqtt_clientid"),
    username: getSetting("mqtt_username"),
    password: getSetting("mqtt_password"),
    clean: true
});

// subscribe to topic on MQTT server
MQTTCONN.on("connect", function () {
    console.log("MQTT connection up and running.");
    sendMQTTRequest("OTHER",getSetting("mqtt_clientid"), "connected")
    // connect to the "stat/#" (all stat messages from all devices) topic for device statistics
    MQTTCONN.subscribe("stat/#", {
        qos: 1
    });
});

// listener for incoming messages, dispatch to JSON and update using io.emit
MQTTCONN.on('message', function (topic, message, packet) {
    console.log("MQTT/incoming: " + topic + " " + message);
    processMQTTResponse(topic,message);
});

//////////////
// REST API //
//////////////

// init updating of all MQTT devices, this will 
// gradually trigger socket.io callbacks to client.
app.get('/devices/update', function (req, res) {
    getDevices().list.forEach(guid => {
        let path = getDevice(guid).path;
        sendMQTTRequest("STATUS", path, null);
    });
    res.status(200).send("update request processed!");
});

// create a new device
app.post('/devices/new', function (req, res) {
    // image is hardcoded until further notice
    addDevice(req.body.path,req.body.name,req.body.type, req.body.description, "images/devices/light_hanging.png")
    res.send("Device added to database!");
});

// create a new zone
app.post('/zones/new', function (req, res) {
    // image is hardcoded until further notice
    //addZone(req.body.name,req.body.description, req.body.command, "images/zones/plan.png", "")
    res.send(req.body);

});

// get an array of device GUIDs
app.get('/setting/:name', function (req, res) {
    res.status(200).send(getSetting(req.params.name));
});

// get an array of device GUIDs
app.get('/devices/list', function (req, res) {
    res.status(200).send(getDevices().list);
});

// get the properties of a device defined by GUID
app.get('/devices/:guid', function (req, res) {
    res.status(200).send(getDevice(req.params.guid));
});

// get an array of zone GUIDs
app.get('/zones/list', function (req, res) {
    res.status(200).send(getZones().list);
});

// get the properties of a device defined by GUID
app.get('/zones/:guid', function (req, res) {
    res.status(200).send(getZone(req.params.guid));
});

// change properties for a device and return said device
app.post('/devices/:guid/edit', function (req, res) {
    let list = req.body.list;
    for (let i = 0; i < list.length; i++) {
        let prop = list[i];
        updateDevice(req.params.guid, prop, req.body[prop]);
    }
    res.send(getDevice(req.params.guid));
});

// change properties for a zone and return said zone
app.post('/zones/:guid/edit', function (req, res) {
    let list = req.body.list;
    for (let i = 0; i < list.length; i++) {
        let prop = list[i];
        updateZone(req.params.guid, prop, req.body[prop]);
    }
    res.send(getZone(req.params.guid));
});

// send a command to a device 
// response for command will come from socket.io
// this one only works for ON/OFF switches!
// do not update the actual state variable, this is done when actual reply received
app.post('/devices/:guid/command/flip', function (req, res) {
    let device = getDevice(req.params.guid);
    let state = device.state;
    if(state == "ON") {
        sendMQTTRequest("COMMAND",device.path,"OFF");
        res.send("command " + "OFF" + " send to" + device.path);
    } else {
        sendMQTTRequest("COMMAND",device.path,"ON");
        res.send("command " + "ON" + " send to" + device.path);
    }
});

// send a command to a device and return the command
// response for command will come from socket.io
// do not update the actual state variable, this is done when actual reply received
app.post('/devices/:guid/command/:command', function (req, res) {
    let device = getDevice(req.params.guid);
    sendMQTTRequest("COMMAND",device.path,req.params.command);
    res.send("command " + req.params.command + " send to" + device.path);
});

// change parameter
app.post('/setting/:name/:value', function (req, res) {
    updateSetting(req.params.name, req.params.value);
    res.send(getSetting(req.params.name));
});

// delete a zone from existence
app.delete('/zones/:guid/delete', function (req, res) {
    removeZone(req.params.guid);
    res.send('DELETE ' + req.params.guid);
});

// delete a zone from existence
app.delete('/devices/:guid/delete', function (req, res) {
    removeDevice(req.params.guid);
    res.send('DELETE ' + req.params.guid);
});

// Express route for any other unrecognised incoming requests, accepted calls should be above this code.
app.get('*', function (req, res) {
    res.status(404).send('Sorry, unrecognised API call');
});

// Express route to handle errors
app.use(function (err, req, res, next) {
    if (req.xhr) {
        res.status(500).send('Oops, Something went wrong!');
    } else {
        next(err);
    }
});

////////////
// SCRIPT //
////////////

// Socket IO polling
io.on('connection', function (socket) {
    console.log('host connected');
    socket.on('disconnect', function () {
        console.log('host disconnected');
    });
});

http.listen(app.get('port'));
console.log('App Server running at port ' + getSetting("websrv_port"));