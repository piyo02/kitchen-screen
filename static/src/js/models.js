flectra.define('kitchen_screen.models', function (require) {
    "use strict";
    
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var rpc = require('web.rpc');
    
    var QWeb = core.qweb;
    var _t = core._t;
    
    models.load_models({
        model: "restaurant.table",
        fields: ['has_printbill'],
        loaded: function(self, tables){
            for (var i = 0; i < tables.length; i++){
                var table = self.tables_by_id[tables[i].id];
                if (table){
                    table.has_printbill = tables[i].has_printbill;
                }
            }
        }
    });


    var _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function(attr,options){
            _super_order.initialize.apply(this,arguments);
            if(!this.has_printbill && this.table){
                this.has_printbill = this.table.has_printbill;
            }
            this.save_to_db();
        },
        set_has_printbill: function(state) {
            this.has_printbill = state;
            this.change_display_button();
        },
        get_has_printbill: function(state){
            return this.has_printbill;
        },
        change_display_button: function(){
            var state = this.get_has_printbill();
            var btnOpenOrder = $('.open-order');
            
            if( state ){
                btnOpenOrder.removeAttr('style');
            } else {
                btnOpenOrder.css('display', 'none');
            }
        },
        update_has_printbill: function(table_id, state){
            var self = this;
            rpc.query({
                model: 'restaurant.table',
                method: 'update_has_printbill',
                args: [{'has_printbill': state, 'table_id': table_id}],
            })
            .then(function(table_id){
                self.set_has_printbill(state);
            }, function(err, ev){
                ev.preventDefault();
                var error_body = _t('Your Internet connection is probably down.');
                if (err.data) {
                    var except = err.data;
                    error_body = except.arguments && except.arguments[0] || except.message || error_body;
                }
                self.pos.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },
        export_as_JSON: function() {
            var json = _super_order.export_as_JSON.apply(this,arguments);
            json.has_printbill            = this.has_printbill || false;
            return json;
        },
        init_from_JSON: function(json) {
            _super_order.init_from_JSON.apply(this,arguments);
            this.has_printbill            = this.pos.tables_by_id[json.table_id].has_printbill;
        }
    });
    
    var _super_orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        initialize: function(attr, options) {
            _super_orderline.initialize.apply(this,arguments);
            this.state_kitchen_order    = this.state_kitchen_order  || "New";
            this.state_orderline        = this.state_orderline      || 'New';
            this.kitchen_orderline_id   = this.kitchen_orderline_id || false;
            this.qty_change             = this.qty_change           || 0;
        },
        set_state_orderline: function(state_orderline){
            this.state_orderline = state_orderline;
            this.trigger('change', this);
        },
        get_state_orderline: function(state_orderline){
            return this.state_orderline;
        },
        set_qty_change: function(qty_change){
            this.qty_change = qty_change;
            this.trigger('change', this);
        },
        get_qty_change: function(qty_change){
            return this.qty_change;
        },
        set_kitchen_orderline_id: function(kitchen_orderline_id){
            this.kitchen_orderline_id = kitchen_orderline_id;
            this.trigger('change', this);
        },
        get_kitchen_orderline_id: function(kitchen_orderline_id){
            return this.kitchen_orderline_id;
        },
        set_state_kitchen_order: function(state_kitchen_order){
            this.state_kitchen_order = state_kitchen_order;
            this.trigger('change', this);
        },
        get_state_kitchen_order: function(state_kitchen_order){
            return this.state_kitchen_order;
        },

         // membuat kitchen order ketika tombol order ditekan
        save_kitchen_order_details: function(orderline){
            var self = this;
            
            var uid         = orderline.order.uid;
            var note        = orderline.note;
            var product_name= orderline.product.display_name;
            var table_id    = orderline.pos.table.id;
            var product_id  = orderline.product.product_tmpl_id;

            var fields = {
                'name'          : `Order ${product_name}`,
                'quantity'      : orderline.quantity,
                'table_id'      : table_id,
                'product_id'    : product_id,
                'uid'           : uid,
                'note'          : note,
            };

            rpc.query({
                model: 'kitchen.order',
                method: 'create_from_ui',
                args: [fields],
            })
            .then(function(kitchen_orderline_id){
                orderline.set_kitchen_orderline_id(kitchen_orderline_id);
                return 'succes rpc';
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

        update_kitchen_order: function(kitchen_orderline_id, qty_change, reason = ""){
            var self = this;
            var fields = { 
                'kitchen_order_id': kitchen_orderline_id,
                'qty': qty_change,
                'reason_cancel': reason,
            }
    
            rpc.query({
                model: 'kitchen.order',
                method: 'update_kitchen_order',
                args: [fields],
            })
            .then(function(orderline_id){
                return orderline_id;
            }, function(err, ev){
                ev.preventDefault();
                var error_body = _t('Your Internet connection is probably down.');
                if (err.data) {
                    var except = err.data;
                    error_body = except.arguments && except.arguments[0] || except.message || error_body;
                }
                self.pos.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },

        update_note_kitchen_order: function(kitchen_order_id, note){
            var self = this;
            var fields = { 
                'kitchen_order_id': kitchen_order_id,
                'note': note,
            }
    
            rpc.query({
                model: 'kitchen.order',
                method: 'update_note_kitchen_order',
                args: [fields],
            })
            .then(function(orderline_id){
                return orderline_id;
            }, function(err, ev){
                ev.preventDefault();
                var error_body = _t('Your Internet connection is probably down.');
                if (err.data) {
                    var except = err.data;
                    error_body = except.arguments && except.arguments[0] || except.message || error_body;
                }
                self.pos.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },

        update_reason_cancel_kitchen_order: function(kitchen_orderline_id, reason_cancel){
            var self = this;
            var fields = { 
                'kitchen_order_id': kitchen_orderline_id,
                'reason_cancel': reason_cancel,
            }
    
            rpc.query({
                model: 'kitchen.order',
                method: 'update_reason_cancel_kitchen_order',
                args: [fields],
            })
            .then(function(orderline_id){
                return orderline_id;
            }, function(err, ev){
                ev.preventDefault();
                var error_body = _t('Your Internet connection is probably down.');
                if (err.data) {
                    var except = err.data;
                    error_body = except.arguments && except.arguments[0] || except.message || error_body;
                }
                self.pos.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },

        // mengupdate qty kitchen order
        update_qty_kitchen_order: function(kitchen_order_id, qty_change){
            var self = this;
            var fields = {
                'kitchen_order_id'  : kitchen_order_id,
                'qty_change'        : qty_change,
            };

            rpc.query({
                model: 'kitchen.order',
                method: 'update_qty_kitchen_order',
                args: [fields],
            })
            .then(function(kitchen_orderline_id){
                return 'succes update_qty_kitchen_order';
            }, function(err, ev){
                ev.preventDefault();
                var error_body = _t('Your Internet connection is probably down.');
                if (err.data) {
                    var except = err.data;
                    error_body = except.arguments && except.arguments[0] || except.message || error_body;
                }
                self.pos.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },

        export_as_JSON: function(){
            var json = _super_orderline.export_as_JSON.apply(this, arguments);
            json.state_orderline        = this.state_orderline;
            json.kitchen_orderline_id   = this.kitchen_orderline_id;
            json.state_kitchen_order    = this.state_kitchen_order;
            json.qty_change             = this.qty_change;
            return json;
        },
        init_from_JSON: function(json){
            this.state_orderline        = json.state_orderline;
            this.kitchen_orderline_id   = json.kitchen_orderline_id;
            this.state_kitchen_order    = json.state_kitchen_order;
            this.qty_change             = json.qty_change;
            _super_orderline.init_from_JSON.call(this, json);
        },
    });
    
});