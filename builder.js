// ==UserScript==
// @name         AD2460 Builder
// @namespace    http://tampermonkey.net/
// @version      0.3.7
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

        self.options = {
            roundTo: 500000,
            recheckRatiosTimeoutSeconds: 300, // 5 minutes
            minWithdrawal: 500000,
            stepDelaySeconds: 4,
            keepResources: 200000,
            retryWithdrawal: false,
        };

        self.QUEUELENGTH = 40;

        self.outpostOptions = {
            outpostSectorIterationSeconds: 1,
            outputThreshold: 130000
        };

        self.log = function (text) {
            console.info('[AutoProduction] ' + text);
        };

        self.names = function () {
            ad2460.productionitems.forEach(function (ship) { self.log(ship.name.toLowerCase()); });
        };

        self._upgradeOutpost = function (outpost, followupFn) {
            $.post('actionhandler.pl', {
                action: 'initiate_outpost_upgrade',
                planet_id: outpost.planet_id
            }, function(data){
                parseInfo(data);
                if (followupFn) {
                    followupFn();
                }
            });
        };

        self.upgradeOutposts = function (index) {
            index = index || 0;
            var outpost = ad2460.outposts[index];

            if (!outpost) {
                return;
            }

            if (!outpost.upgrading && outpost.level < 10) {
                self._upgradeOutpost(outpost, function () {
                    self.upgradeOutposts(++index);
                });
            } else {
                self.upgradeOutposts(++index);
            }
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
                if (fleet.type === 'Outpost') {
                    return;
                }
                fleet.ships.forEach(function (fleetShip) {
                    if (fleetShip.ship_type_id === ship.id) {
                        count++;
                    }
                });
            });

            return count;
        };

        self._getRatios = function (ships, shipsSoFar) {
            var ratios = $.map(ships, function (count, ship) {
                var soFar = $.grep(shipsSoFar, function (el) {
                    return el === ship;
                }).length;

                soFar *= self._getShipUnitsModifier(self.findShip(ship));

                // check how many such ships i have
                var have = self._getMyShipsCount(self.findShip(ship)) + soFar;
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

        self.ratios = function () {
            var ratios = self._getRatios(self.targetShips);
            self._logRatios(self.targetShips, ratios);
        };

        self._logRatios = function (ships, ratios) {
            var i = 0;
            var ratiosMsg = 'ratios: ' + $.map(ships, function (index, ship) {
                return ship + ': ' + Math.round(ratios[i++] * 100) + '%';
            }).join(' / ');

            self.log(ratiosMsg);
        };

        self._checkRatiosAndBuild = function (options) {
            var ships = self.targetShips;

            // 1. check how many spots in prod queue
            var freeSpots = self.QUEUELENGTH - ad2460.productionqueue.length;
            var leftSeconds = 0;

            if (ad2460.productionqueue.length > 0) {
                leftSeconds = ad2460.productionqueue.reduce(function (s, item) {
                    var nowEpoch = Math.round(new Date().getTime() / 1000);
                    return s + (item.building === 1 ?
                        item.finish_time - nowEpoch :
                        item.est_build_time);
                }, 0);
            }


            // TODO also include items currently in queue for ratios calculation
            // TODO also for cost calculation
            var shipsSoFar = [];
            for (var i = 0; i < freeSpots; i++) {

                var ratios = self._getRatios(ships, shipsSoFar);
                var ship = self._pickBestShip(ships, ratios);
                if (ship) {
                    shipsSoFar.push(ship);
                    self._logRatios(ships, ratios);
                }
            }

            var interval = 0;

            if (shipsSoFar.length > 0) {
                self.withdrawAndProduce(shipsSoFar);
                interval = self.getTotalTimeCost(shipsSoFar) + leftSeconds;
            } else if (self.options.retryWithdrawal) {
                interval = self.options.recheckRatiosTimeoutSeconds;
            }

            if (interval > 0) {
                self.handle = setTimeout(function () {
                    self._checkRatiosAndBuild(options);
                }, interval * 1000);
            }
        };

        self.getTotalTimeCost = function (ships) {
            return ships.reduce(function (s, ship) {
                return s + self.calculateTimeCost(self.findShip(ship));
            }, 0);
        };

        self.stop = function () {
            if (self.handle) {
                self.log('stopping autoproduction');
                clearInterval(self.handle);
                self.handle = null;
            }
        };

        self._getShipUnitsModifier = function (ship) {
            var modifier = 1;

            if (ship.vesseltype === 'Normal' ) {
                if (ship.vesselclass === 'Fighter') {
                    modifier = 5;
                }
                if (ship.vesselclass === 'Corvette') {
                    modifier = 2;
                }
            }

            return modifier;
        };

        self.getShipCost = function (ship) {
            var modifier = self._getShipUnitsModifier(ship);

            var total = {
                h: (ship.h_cost * modifier),
                i: (ship.i_cost * modifier),
                s: (ship.s_cost * modifier),
                n: (ship.n_cost * modifier)
            };

            return total;
        };

        self.withdrawAndProduce = function (ships) {
            var humanizeFn = function (value) {
                var roundTo = self.options.roundTo;
                var val = Math.ceil(Math.max(value, 0) / roundTo) * roundTo;
                return val > 0 ? Math.max(val, self.options.minWithdrawal) : 0;
            };

            var spare = self.getSpareRes(ships);

            var total = {
                h: humanizeFn(-spare.h),
                i: humanizeFn(-spare.i),
                s: humanizeFn(-spare.s),
                n: humanizeFn(-spare.n)
            };

            if (total.h + total.i + total.s + total.n === 0) {
                return self._produceShips(ships);
            }

            self.log('withdrawing H' + total.h + ' I' + total.i +
                ' S' + total.s + ' N' + total.n);

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
                    setTimeout(function () {
                        self.withdrawAndProduce(ships);
                    }, self.options.recheckRatiosTimeoutSeconds * 1000);
                    self.log('error withdrawing, scheduling a retry');
                } else {
                    self._produceShips(ships);
                }
            });
        };

        self._produce = function (ship, handlerFn) {
            self.log('producing ' + ship.name);

            $.post('actionhandler.pl', {
                action:'initiate_production',
                id:ship.id
            }, function(data) {
                parseInfo(data);

                if (handlerFn) {
                    handlerFn();
                }
            });
        };

        self._produceShips = function (ships, index) {
            index = index || 0;

            if (!ships[index]) {
                return;
            }

            self._produce(self.findShip(ships[index]), function () {
                setTimeout(function () {
                    self._produceShips(ships, ++index);
                }, self.options.stepDelaySeconds * 1000);
            });
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

        self.getSpareRes = function (ships) {
            var total = {
                h: 0,
                i: 0,
                s: 0,
                n: 0
            };

            $.each(ships, function (index, ship) {
                var cost = self.getShipCost(self.findShip(ship));
                total.h += cost.h;
                total.i += cost.i;
                total.s += cost.s;
                total.n += cost.n;
            });

            return {
                h: (ad2460.resources.hassium - self.options.keepResources) - total.h,
                i: (ad2460.resources.indium - self.options.keepResources) - total.i,
                s: (ad2460.resources.strontium - self.options.keepResources) - total.s,
                n: (ad2460.resources.neodymium - self.options.keepResources) - total.n,
            };
        };

        self._getOutpostTilt = function (planet) {
            var average = (planet.hassium_max_output +
                planet.indium_max_output +
                planet.neodymium_max_output +
                planet.strontium_max_output) / 4;

            var tilts = [];

            if (planet.hassium_max_output > average) {
                tilts.push('hs');
            }

            if (planet.indium_max_output > average) {
                tilts.push('in');
            }

            if (planet.neodymium_max_output > average) {
                tilts.push('nd');
            }

            if (planet.strontium_max_output > average) {
                tilts.push('sr');
            }

            return tilts.length > 2 ? 'even' : tilts.join('/');
        };

        self._checkSector = function (quadrant, sector) {

            $.post('actionhandler.pl', {
                action: 'fetch_compiled_prospecting_report',
                quadrant: quadrant,
                sector: sector,
                available_only: 1,
            }, function (data) {
                parseInfo(data);
                hideSimpleBox();

                $.each(ad2460.prospectReport, function (index, planet) {
                    var maxOutput = planet.hassium_max_output +
                        planet.indium_max_output +
                        planet.neodymium_max_output +
                        planet.strontium_max_output;

                    if (maxOutput > self.outpostOptions.outputThreshold) {
                        self.log('found ' + Math.round(maxOutput / 1000) + 'k ' +
                            self._getOutpostTilt(planet) +
                            ' outpost in ' + quadrant + ':' + sector);
                    }
                });

                // Recursion
                sector++;
                if (sector > 16) {
                    sector = 1;
                    quadrant++;
                }

                if (quadrant > 7) {
                    return self.log('finished looking for ops');
                }

                setTimeout(function () {
                    self._checkSector(quadrant, sector);
                }, self.outpostOptions.outpostSectorIterationSeconds);
            });

        };

        self.findOps = function (options) {
            self.log('starting looking for ops');
            self.outpostOptions = $.extend(self.outpostOptions || {}, options);
            self._checkSector(6, 1);
        };

        self.calculateTimeCost = function (ship) {
            var timeCost = ship.time_cost;
            var timeCostBonus = 0;
            var modifier = self._getShipUnitsModifier(ship);
            timeCost *= modifier;

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

            if (ad2460.vip_status) {
                timeCostBonus+=20;
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

            return timeCost;

        };

        return self;


    }

    window.Builder = Builder;
    window.adBuilder = new Builder();

})();
