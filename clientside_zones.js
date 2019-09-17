var api_url = 'http://localhost:3000/';
var zones = [];
var currentzone;

$("document").ready(function () {
    // request an update for all devices
    $.ajax({
        url: api_url + "devices/update",
        success: function (result) {
            initZones();
        }
    });
});

// this function will run when the document is ready
function initZones() {
    setTimeout(function () {
        $.ajax({
            url: api_url + "zones/list",
            success: function (result) {
                result.forEach(zoneid => {
                    $.ajax({
                        url: api_url + "zones/" + zoneid,
                        success: function (result) {
                            createHTMLZone(zoneid, result.name, result.description, result.command, result.image, result.devices);
                        }
                    })
                });
            }
        })
        // now remove the loader
        document.getElementById("loader").hidden = true;
    }, 2000);
}

function commandOnZone(guid, command, devices) {
    currentzone = guid;
    console.log("executing command on zone " + guid + " with " + devices  + " and command " + command)
    // show interaction with UI - this will be "reset" when command is received
    document.getElementById(guid).setAttribute("class", "zoneonclick");
    // send command to server - reply is auto processed
    devices = devices.split(","); // create an array as it is passed as a string from HTML
    devices.forEach(devguid => {
        $.ajax({
            url: api_url + "devices/" + devguid + "/command/" + command,
            type: "POST",
            success: function (result) {
                console.log("command send")
            }
        }) 
    });
    document.getElementById(guid).getElementsByClassName("enforcement")[0].innerHTML = "enforced";
}

// create a new HTML device
function createHTMLZone(id, name, description, command, image, devices) {
    var content = '<div class="device" id="' + id + '" onclick="commandOnZone(\'' + id + '\',\'' + command + '\',\'' + devices +'\')"><div class="devicecontent"><span class="enforcement">' +
        'not enforced' + '</span><h1 class="devicename">' + name + '</h1><p class="devicedescription">' +
        description + '</p><div class="devicebutton"><a class="devicestate" href="#">' +
        'turn ' + command +  '</a></div></div><img class= "cardimage" src="' +
        image + '" width="300px" class="animated fadeInRight"></div>';
    console.log("create new zone: " + name + " guid: " + id);
    document.getElementById("listingzones").insertAdjacentHTML("beforeend", content);
}

// socket function to allow independent traffic from server to frontend
$(function () {
    var socket = io();
    socket.on('iotmsg', function (msg) {
        if(document.getElementById(currentzone) !== null) { // if it is null, no zone is selected
            console.log("response received - all OK")
            document.getElementById(currentzone).setAttribute("class", "zoneon");
            currentzone = null; // reset currentzone so that when a device is triggered, no accidents happen
        }
    });
});

function overlayOn() {
    document.getElementById("overlay").style.display = "block";
}
  
function overlayOff() {
    document.getElementById("overlay").style.display = "none";
}