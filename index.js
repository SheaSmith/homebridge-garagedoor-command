var Service;
var Characteristic;
var request = require('request');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-garagedoor-command', 'GarageCommand', GarageCmdAccessory);
};

function GarageCmdAccessory(log, config) {
  this.log = log;
  this.name = config.name;
  this.url = config.url;
  this.statusUpdateDelay = 15;
  this.pollStateDelay = 0;
}

GarageCmdAccessory.prototype.setState = function(isClosed, callback, context) {
  if (context === 'pollState') {
    // The state has been updated by the pollState command - don't run the open/close command
    callback(null);
    return;
  }

  var accessory = this;
  var state = isClosed ? 'close' : 'open';

  request.post(`${this.url}/toggle`, function (error, response, body) {
        accessory.log('Set ' + accessory.name + ' to ' + state);
        if (state == 'open') {
          accessory.garageDoorService.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPENING);
          setTimeout(
            function() {
              accessory.garageDoorService.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPEN);
            },
            accessory.statusUpdateDelay * 1000
          );
        } else {
          accessory.garageDoorService.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSING);
          setTimeout(
            function() {
              accessory.garageDoorService.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
            },
            accessory.statusUpdateDelay * 1000
          );
        }
       callback(null);
  });
};

GarageCmdAccessory.prototype.getState = function(callback) {
  var accessory = this;
  var command = accessory.stateCommand;

  request.post(`${this.url}/status`, function (error, response, body) {
      var state = body == 'open' ? 'OPEN' : 'CLOSED';
      accessory.log('State of ' + accessory.name + ' is: ' + state);

      callback(null, Characteristic.CurrentDoorState[state]);
    

    if (accessory.pollStateDelay > 0) {
      accessory.pollState();
    }
  });
};

GarageCmdAccessory.prototype.pollState = function() {
  var accessory = this;

  // Clear any existing timer
  if (accessory.stateTimer) {
    clearTimeout(accessory.stateTimer);
    accessory.stateTimer = null;
  }

  accessory.stateTimer = setTimeout(
    function() {
      accessory.getState(function(err, currentDeviceState) {
        if (err) {
          accessory.log(err);
          return;
        }

        if (currentDeviceState === Characteristic.CurrentDoorState.OPEN || currentDeviceState === Characteristic.CurrentDoorState.CLOSED) {
          // Set the target state to match the actual state
          // If this isn't done the Home app will show the door in the wrong transitioning state (opening/closing)
          accessory.garageDoorService.getCharacteristic(Characteristic.TargetDoorState)
            .setValue(currentDeviceState, null, 'pollState');
        }
        accessory.garageDoorService.setCharacteristic(Characteristic.CurrentDoorState, currentDeviceState);
      })
    },
    accessory.pollStateDelay * 1000
  );
}

GarageCmdAccessory.prototype.getServices = function() {
  this.informationService = new Service.AccessoryInformation();
  this.garageDoorService = new Service.GarageDoorOpener(this.name);

  this.informationService
  .setCharacteristic(Characteristic.Manufacturer, 'Garage Command')
  .setCharacteristic(Characteristic.Model, 'Homebridge Plugin')
  .setCharacteristic(Characteristic.SerialNumber, '001');

  this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState)
  .on('set', this.setState.bind(this));

  if (this.stateCommand) {
    this.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', this.getState.bind(this));
    this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState)
    .on('get', this.getState.bind(this));
  }

  return [this.informationService, this.garageDoorService];
};
