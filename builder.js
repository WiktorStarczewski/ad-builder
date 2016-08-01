// ==UserScript==
// @name         AD2460 Builder
// @namespace    http://tampermonkey.net/
// @version      0.2.2
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
            keepResources: 100000
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

        self.build = function (ships, options) {

            if(self.handle) { self.stop(); }

            $.extend(self.options, options);

            ships = ships.map(self.findShip);
            var interval = ships.reduce(function (s, ship) {
                return s + self.calculateTimeCost(ship);
            }, 0);
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

            return 'success';
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
            var total = self.getShipCost(ship);

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


        self.canAffordShip = function (ship) {
            var total = self.getShipCost(ship);

            return (ad2460.resources.hassium >= total.h &&
                ad2460.resources.indium >= total.i &&
                ad2460.resources.strontium >= total.s &&
                ad2460.resources.neodymium >= total.n);
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

            return timeCost;

        };

        return self;


    }

    window.Builder = Builder;
    window.adBuilder = new Builder();

})();
