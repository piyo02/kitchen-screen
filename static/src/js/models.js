flectra.define('kitchen_screen.models', function (require) {
    "use strict";

    var ajax = require('web.ajax');
    var BarcodeParser = require('barcodes.BarcodeParser');
    var PosDB = require('point_of_sale.DB');
    var devices = require('point_of_sale.devices');
    var concurrency = require('web.concurrency');
    var core = require('web.core');
    var field_utils = require('web.field_utils');
    var rpc = require('web.rpc');
    var session = require('web.session');
    var time = require('web.time');
    var utils = require('web.utils');

    var QWeb = core.qweb;
    var _t = core._t;
    var Mutex = concurrency.Mutex;
    var round_di = utils.round_decimals;
    var round_pr = utils.round_precision;

    var exports = {};
});