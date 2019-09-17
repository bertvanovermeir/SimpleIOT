var api_url = 'http://localhost:3000/';
var devices = [];

$("document").ready(function () {
    // request an update for all devices
    $.ajax({
        url: api_url + "devices/update",
        success: function (result) {
            initDevices();
        }
    });
});

// this function will run when the document is ready
function initDevices() {
    setTimeout(function () {
        $.ajax({
            url: api_url + "devices/list",
            success: function (result) {
                result.forEach(devid => {
                    $.ajax({
                        url: api_url + "devices/" + devid,
                        success: function (result) {
                            createHTMLDevice(devid, result.type, result.name, result.description, result.state, result.image);
                        }
                    })
                });
            }
        })
        // now remove the loader
        document.getElementById("loader").hidden = true;
    }, 2000);
}

// update a HTML device
function updateHTMLDevice(guid) {
    if (document.getElementById(guid) !== null) {
        $.ajax({
            url: api_url + "devices/" + guid,
            success: function (result) {
                console.log("update existing device: " + result.name + " guid: " + guid);
                // update all relevant text
                document.getElementById(guid).getElementsByClassName("devicestate")[0].innerHTML = result.state;
                // update color scheme according to type/state - back to normal
                if (result.state == "ON") {
                    document.getElementById(guid).setAttribute("class", "deviceon");
                } else {
                    document.getElementById(guid).setAttribute("class", "deviceoff");
                }
            }
        })
    }
}

function commandOnDevice(guid) {
    console.log("executing command on device " + guid)
    // show interaction with UI - this will be "reset" when command is received
    document.getElementById(guid).setAttribute("class", "deviceonclick");
    // send command to server - reply is auto processed
    $.ajax({
        url: api_url + "devices/" + guid + "/command/flip",
        type: "POST",
        success: function (result) {
            console.log("command send")
        }
    })
}

// create a new HTML device
function createHTMLDevice(id, type, friendlyname, description, state, imagepath) {
    var content = '<div class="device" id="' + id + '" onclick="commandOnDevice(\'' + id + '\')"><div class="devicecontent"><span class="devicetype">' +
        type + '</span><h1 class="devicename">' + friendlyname + '</h1><p class="devicedescription">' +
        description + '</p><div class="devicebutton"><a class="devicestate" href="#">' +
        state + '</a></div></div><img class= "cardimage" src="' +
        imagepath + '" width="300px" class="animated fadeInRight"></div>';
    console.log("create new device: " + friendlyname + " guid: " + id);
    document.getElementById("listing").insertAdjacentHTML("beforeend", content);
    updateHTMLDevice(id);
}

// socket function to allow independent traffic from server to frontend
$(function () {
    var socket = io();
    socket.on('iotmsg', function (msg) {
        updateHTMLDevice(msg.id);
    });
});

function overlayOn() {
    document.getElementById("overlay").style.display = "block";
  }
  
  function overlayOff() {
    document.getElementById("overlay").style.display = "none";
  }