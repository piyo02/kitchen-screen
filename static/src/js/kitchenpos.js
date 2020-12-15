flectra.define('kitchen_screen.kitchenpos', function (require) {
"use strict";

var models = require('point_of_sale.models');
var screens = require('point_of_sale.screens');
var core = require('web.core');
var gui = require('point_of_sale.gui');
var rpc = require('web.rpc');

var QWeb = core.qweb;
var _t = core._t;

var _super_orderline = models.Orderline.prototype;
var _super_posmodel = models.PosModel.prototype;

models.PosModel = models.PosModel.extend({
    initialize: function(session, attributes){
        this.has_printbill = false;
        return _super_posmodel.initialize.call(this,session,attributes);
    },

    set_has_printbill: function(state) {
        this.has_printbill = state
    },

    get_has_printbill: function(state){
        return this.has_printbill;
    }
});

models.Orderline = models.Orderline.extend({
    initialize: function(attr, options) {
        _super_orderline.initialize.call(this,attr,options);
        this.state_order = this.state_order || "New";
        this.state_kitchen_order = this.state_kitchen_order || "New";
        this.kitchen_order_id = this.kitchen_order_id || "New";
    },
    set_state_order: function(state_order){
        this.state_order = state_order;
        this.trigger('change', this);
    },
    get_state_order: function(state_order){
        return this.state_order;
    },
    get_state_kitchen_order: function(state_kitchen_order){
        return this.state_kitchen_order;
    },
    set_kitchen_order_id: function(kitchen_order_id){
        this.kitchen_order_id = kitchen_order_id;
        this.trigger('change', this);
    },
    get_kitchen_order_id: function(kitchen_order_id){
        return this.kitchen_order_id;
    },
    export_as_JSON: function(){
        var json = _super_orderline.export_as_JSON.call(this);
        json.state_order = this.state_order;
        json.kitchen_order_id = this.kitchen_order_id;
        return json;
    },
    init_from_JSON: function(json){
        _super_orderline.init_from_JSON.apply(this, arguments);
        this.state_order = json.state_order;
        this.kitchen_order_id = json.kitchen_order_id;
    },
});

screens.ActionButtonWidget.include({
    init: function(parent, options) {
        this._super(parent, options);
    },

    save_kitchen_order_details: function(orderline){
        var self = this;
        var d = new Date;

        var product_name = orderline.product.display_name;
        var table_name = orderline.pos.table.name;
        var table_id = orderline.pos.table.id;
        var product_id = orderline.product.id;

        var fields = {
            'description': `Order ${product_name}  meja ${table_name}`,
            'name': `Order ${product_name}`,
            'quantity': orderline.quantity,
            'table_id': table_id,
            'product_id': product_id,
        };

        rpc.query({
            model: 'kitchen.order',
            method: 'create_from_ui',
            args: [fields],
        })
        .then(function(kitche_order_id){
            console.log('succes rpc');
            orderline.set_kitchen_order_id(kitche_order_id);
        }, function(err, ev){
            ev.preventDefault();
            var error_body = _t('Your Internet connection is probably down.');
            if (err.data) {
                var except = err.data;
                error_body = except.arguments && except.arguments[0] || except.message || error_body;
            }
            self.gui.show_popup('error',{
                'title': _t('Error: Could not Save Changes'),
                'body': error_body,
            });
        });
    },

    save_description_void: function(orderline, description){
        
        var kitchen_order_id = orderline.get_kitchen_order_id();
        var fields = { 
            'description': description,
            'kitchen_order_id': kitchen_order_id,
        }

        rpc.query({
            model: 'kitchen.order',
            method: 'save_description_void',
            args: [fields],
        })
        .then(function(orderline_id){
            console.log('succes save_description_void');
        }, function(err, ev){
            ev.preventDefault();
            var error_body = _t('Your Internet connection is probably down.');
            if (err.data) {
                var except = err.data;
                error_body = except.arguments && except.arguments[0] || except.message || error_body;
            }
            self.gui.show_popup('error',{
                'title': _t('Error: Could not Save Changes'),
                'body': error_body,
            });
        });
    },

    renderElement: function() {
        var self = this;
        this._super();
        $('.order-submit').click(function(){
            var orderlines = self.pos.get_order().orderlines;
            orderlines.forEach(orderline => {
                var state_order = 'Ordered';
                if (orderline.state_order == 'New'){
                    orderline.set_state_order(state_order);
                    self.save_kitchen_order_details(orderline);
                }
            });
        });

        $('.next').click(function(){
            console.log(self.pos.gui)
            if (self.pos.gui.default_screen == 'bill'){
                self.pos.set_has_printbill(true);
                var state_has_printbill = self.pos.get_has_printbill();
                console.log(state_has_printbill);
                // munculkan tombol open order
            }
        });

        $('.order-printbill').click(function(){
            console.log(self.pos.gui);
        });
    }
});

var ButtonOpenOrder = screens.ActionButtonWidget.extend({
    template: 'ButtonOpenOrder',
    button_click: function(){
        var line = this.pos.get_order().get_selected_orderline();
        console.log("line: ");
    },
});

screens.define_action_button({
    'name': 'button_open_order',
    'widget': ButtonOpenOrder,
});

});