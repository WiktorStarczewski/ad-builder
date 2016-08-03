// ==UserScript==
// @name         AD2460 Builder
// @namespace    http://tampermonkey.net/
// @version      0.2.5
// @description  try to take over the world!
// @author       Anonymous
// @match        http://live.ad2460.com/game.pl
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

function Builder () {

        var self = this;

        self.handle = null;
        self.currentIteration = 0;
        self.currentDelay = 0;

        self.options = {
            delay: 400,
            move: false,
            iterations: 1,
            keepResources: 100000,
            roundTo: 100000,
            recheckRatiosTimeoutSeconds: 300, // 5 minutes
            precision: 10, // add X seconds to each ship build time
        };

        self.log = function (text) {
            console.info('[AutoProduction] ' + text);
        };

        self.names = function () {
            ad2460.productionitems.forEach(function (ship) { self.log(ship.name.toLowerCase()); });
        };

        self.delay = function () {
            return self.options.delay * ++self.currentDelay;
        };

        self.setTimeout = function (f) {
            window.setTimeout(f, self.delay());
        };

        self.buildFleet = function (ships, options) {
            if (self.handle) { self.stop(); }

            $.extend(self.options, options);
            self.targetShips = ships;

            self.log('building a fleet started');
            self._checkRatiosAndBuild(options);
        };

        self.updateFleet = function (ships) {
            self.targetShips = ships;
        };

        self.estimate = function () {
            if (typeof self.targetShips !== 'object') {
                return;
            }

            var times = $.map(self.targetShips, function (count, ship) {
                var shipObject = self.findShip(ship);
                var current = self._getMyShipsCount(shipObject);
                return (count - current) * self.calculateTimeCost(shipObject);
            });

            var time = times.reduce(function (s, time) {
                return s + time;
            }, 0);
            var hours = Math.floor(time / 60 / 60);
            var minutes = Math.round((time - (hours * 60 * 60)) / 60);

            self.log('estimated time remaining: ' + hours + ' hours ' + minutes + ' minutes');
        };

        self._getMyShipsCount = function (ship) {
            var count = 0;

            ad2460.myFleets.forEach(function (fleet) {
                fleet.ships.forEach(function (fleetShip) {
                    if (fleetShip.ship_type_id === ship.id) {
                        count++;
                    }
                });
            });

            return count;
        };

        self._getRatios = function (ships) {
            var ratios = $.map(ships, function (count, ship) {
                // check how many such ships i have
                var have = self._getMyShipsCount(self.findShip(ship));
                var ratio = have / count;
                return ratio;
            });

            return ratios;
        };

        self._pickBestShip = function (ships, ratios) {
            var minRatio = Math.min.apply(null, ratios);
            var shipsArray = $.map(ships, function (count, ship) {
                return ship;
            });
            return minRatio < 1.0 && shipsArray[ratios.indexOf(minRatio)];
        };

        self._logRatios = function (ships, ratios) {
            self.log('current ship ratios');

            var i = 0;
            $.each(ships, function (ship, index) {
                console.log('  - ', ship, ' : ', ratios[i++] * 100, '%');
            });
        };

        self._checkRatiosAndBuild = function (options) {
            var ships = self.targetShips;
            var ratios = self._getRatios(ships);
            var ship = self._pickBestShip(ships, ratios);
            var interval = 0;

            self._logRatios(ships, ratios);
            if (ship) {
                ship = self.findShip(ship);
                self.log('chose ' + ship.name + ' as most optimal to build');

                interval = self.calculateTimeCost(ship);
            } else {
                self.log('no ships to build - queueing a recheck');
                interval = self.options.recheckRatiosTimeoutSeconds;
            }

            self.handle = setTimeout(function () {
                self._checkRatiosAndBuild(ships, options);
            }, interval * 1000);

            if (ship) {
                self.setTimeout(function () { self.produce(ship); });
            }
        };

        self.getTotalTimeCost = function (ships) {
            return ships.reduce(function (s, ship) {
                return s + self.calculateTimeCost(ship);
            }, 0);
        };

        self.build = function (ships, options) {
            if (self.handle) { self.stop(); }

            $.extend(self.options, options);

            ships = ships.map(self.findShip);

            var interval = self.getTotalTimeCost(ships);
            self.ships = ships;
            self.currentIteration = 0;

            if (self.options.iterations < 1) {
                return self.log('you need to specify at least 1 iteration');
            }

            self.loop();

            if (self.options.iterations > 1) {
                self.log('starting autoproduction');
                self.handle = setInterval(self.loop, interval * 1000);
            }
        };

        self.iterations = function () {
            self.log("Currently on iteration " + self.currentIteration + " of " + self.options.iterations);
        };

        self.stop = function () {
            if (self.handle) {
                self.log('stopping autoproduction');
                clearInterval(self.handle);
                self.handle = null;
            }
        };

        self.loop = function () {

            self.currentDelay = 0;

            if(self.options.iterations > 1 && self.currentIteration++ === self.options.iterations) {
                self.stop();
            }

            self.ships.forEach(function (ship) {

                if(ship) {
                    self.setTimeout(function () { self.produce(ship); });

                    if(self.options.move) {
                        self.setTimeout(function () { self.move(ship); });
                    }
                }

            });
        };

        self.produce = function (ship) {
            self.log('trying to produce ' + ship.name);

            if (self.canAffordShip(ship)) {
                self._produce(ship);
            } else {
                self.widthdrawAndProduce(ship);
            }
        };

        self.getShipCost = function (ship) {
            var modifier = 1;

            if (ship.vesseltype === 'Normal' ) {
                if (ship.vesselclass === 'Fighter') {
                    modifier = 5;
                }
                if (ship.vesselclass === 'Corvette') {
                    modifier = 2;
                }
            }

            var total = {
                h: (ship.h_cost * modifier) + self.options.keepResources,
                i: (ship.i_cost * modifier) + self.options.keepResources,
                s: (ship.s_cost * modifier) + self.options.keepResources,
                n: (ship.n_cost * modifier) + self.options.keepResources
            };

            return total;
        };

        self.widthdrawAndProduce = function (ship) {
            var spare = self.getSpareRes(ship);
            var roundTo = self.options.roundTo;
            var total = {
                h: Math.ceil(Math.max(-spare.h, 0) / roundTo) * roundTo,
                i: Math.ceil(Math.max(-spare.i, 0) / roundTo) * roundTo,
                s: Math.ceil(Math.max(-spare.s, 0) / roundTo) * roundTo,
                n: Math.ceil(Math.max(-spare.n, 0) / roundTo) * roundTo,
            };

            self.log('withdrawing H' + total.h + ' I' + total.i +
                ' S' + total.s + ' N' + total.n +
                ' to produce ' + ship.name);

            $.post('actionhandler.pl', {
                action: 'donate_from_bank',
                hassium: total.h,
                neodymium: total.n,
                strontium: total.s,
                indium: total.i,
                target_user_id: ad2460.user_id
            }, function(data){
                parseInfo(data);

                if (data.indexOf('Error') >= 0) {
                    self.log('error withdrawing, not attempting to produce');
                } else {
                    self._produce(ship);
                }
            });
        };

        self._produce = function (ship) {
            $.post('actionhandler.pl', {action:'initiate_production', id:ship.id}, function(data){ parseInfo(data);});
        };

        self.move = function (ship) {
            self.setTimeout(function() { selectFleet(self.findBaseFleet()); });
            self.setTimeout(selected_fleet_shipreassign_button_click);
            self.setTimeout(function() { reassignShiptypeClick(ship.id); });
            self.setTimeout(reassignSelectAll);
            self.setTimeout(setReassignmentClick);
            self.setTimeout(executeReassignmentClick);
        };

        self.findBaseFleet = function () {
            return ad2460.myFleets[0].fleet_id;
        };

        self.findShip = function (shipName) {

            function stringMatch(value, match) {
                value = value.toLowerCase();
                match = match.toLowerCase();
                return value.localeCompare(match) === 0;
            }

            for(var i in ad2460.productionitems) {
                if(stringMatch(ad2460.productionitems[i].name, shipName)) {
                    return ad2460.productionitems[i];
                }
            }

            self.log(shipName + ' is not a valid ship name');
            return null;

        };

        self.getSpareRes = function (ship) {
            var total = self.getShipCost(ship);

            return {
                h: ad2460.resources.hassium - total.h,
                i: ad2460.resources.indium - total.i,
                s: ad2460.resources.strontium - total.s,
                n: ad2460.resources.neodymium - total.n,
            };
        };

        self.canAffordShip = function (ship) {
            var spare = self.getSpareRes(ship);
            return spare.h >= 0 && spare.i >= 0 && spare.s >= 0 && spare.n >= 0;
        };

        self.calculateTimeCost = function (ship) {
            var timeCost = ship.time_cost;
            var timeCostBonus = 0;

            if (ship.vesseltype=='Normal'){
                if (ship.vesselclass=='Fighter' ){
                    timeCost=ship.time_cost*5;
                }
                else if (ship.vesselclass=='Corvette'){
                    timeCost=ship.time_cost*2;
                }
            }

            var playerlevel=ad2460.scores.level;
            if (playerlevel>=10){
                timeCostBonus+=5;
            }
            if (playerlevel>=12){
                timeCostBonus+=5;
            }
            if (playerlevel>=14){
                timeCostBonus+=5;
            }
            if (playerlevel>=16){
                timeCostBonus+=5;
            }
            if (playerlevel>=18){
                timeCostBonus+=5;
            }
            if (playerlevel>=20){
                timeCostBonus+=5;
            }

            var r=returnGameObjectById(183);
            if (r){
                if (r.user_id===ad2460.user_id && r.upgrading===0){
                    timeCostBonus+=5;
                }
            }
            r=returnGameObjectById(193);
            if (r){
                if (r.user_id===ad2460.user_id && r.upgrading===0){
                    timeCostBonus+=15;
                }
            }
            r=returnGameObjectById(360);
            if (r){
                if (r.user_id===ad2460.user_id && r.upgrading===0){
                    timeCostBonus+=5;
                }
            }

            r=returnGameObjectById(800);
            if (r){
                timeCostBonus+=r.points;
            }
            r=returnGameObjectById(803);
            if (r){
                timeCostBonus+=r.points;
            }
            r=returnGameObjectById(806);
            if (r){
                timeCostBonus+=r.points;
            }

            if (ship.tech=='Matter'){
                r=returnGameObjectById(822);
                if (r){
                    if (r.points==1){   timeCostBonus+=r.bonus_modifier_1;      }
                    if (r.points==2){   timeCostBonus+=r.bonus_modifier_2;      }
                    if (r.points==3){   timeCostBonus+=r.bonus_modifier_3;      }
                    if (r.points==4){   timeCostBonus+=r.bonus_modifier_4;      }
                    if (r.points==5){   timeCostBonus+=r.bonus_modifier_5;      }
                }
            }

            if (ship.tech=='Energy'){
                r=returnGameObjectById(825);
                if (r){
                    if (r.points==1){   timeCostBonus+=r.bonus_modifier_1;      }
                    if (r.points==2){   timeCostBonus+=r.bonus_modifier_2;      }
                    if (r.points==3){   timeCostBonus+=r.bonus_modifier_3;      }
                    if (r.points==4){   timeCostBonus+=r.bonus_modifier_4;      }
                    if (r.points==5){   timeCostBonus+=r.bonus_modifier_5;      }
                }
            }

            if (ship.tech=='Displacement'){
                r=returnGameObjectById(828);
                if (r){
                    if (r.points==1){   timeCostBonus+=r.bonus_modifier_1;      }
                    if (r.points==2){   timeCostBonus+=r.bonus_modifier_2;      }
                    if (r.points==3){   timeCostBonus+=r.bonus_modifier_3;      }
                    if (r.points==4){   timeCostBonus+=r.bonus_modifier_4;      }
                    if (r.points==5){   timeCostBonus+=r.bonus_modifier_5;      }
                }
            }

            if (ad2460.amnestyUntilTime>ad2460.serverTime){
                timeCost=Math.floor(timeCost*75/100);
            }

            timeCost=timeCost-Math.floor(timeCost * timeCostBonus / 100);

            return timeCost + self.options.precision;

        };

        return self;


    }

    window.Builder = Builder;
    window.adBuilder = new Builder();

})();
