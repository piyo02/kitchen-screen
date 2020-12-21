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

    models.load_models({
        model: "kitchen.screen",
        fields: ['name', 'table_id'],
        loaded: function(self, screens){
            self.screens_by_id = {};
            for (var i = 0; i < screens.length; i++){
                self.screens_by_id[screens[i].id] = screens[i];
            }
        }
    });
    
    models.load_models({
        model: "kitchen.order",
        fields: ['id', 'kitchen_id', 'product_tmp_id', 'state_order', 'stage_id', 'order_name', 'qty_change', 'date_order'],
        domain: function(self){ 
            var date_order = self.pos_session.start_at.split(" ")[0] + " 00:00:00";
            return [['date_order', '>=', date_order]] 
        },
        loaded: function(self, kitchen_orders){
            self.orderlines_ = {}
            for (var i = 0; i < kitchen_orders.length; i++){
                var kitchen_order = kitchen_orders[i];

                var table_id = self.screens_by_id[kitchen_order.kitchen_id[0]]['table_id'];

                var kitchen_order_by_ordername = self.orderlines_[kitchen_order.order_name];
                if (!kitchen_order_by_ordername){
                    self.orderlines_[kitchen_order.order_name] = {}
                    var kitchen_order_by_ordername = self.orderlines_[kitchen_order.order_name];

                    var kitchen_order_by_table = kitchen_order_by_ordername[table_id[0]];
                    if( !kitchen_order_by_table ){
                        kitchen_order_by_ordername[table_id[0]] = {}
                        var kitchen_order_by_table = kitchen_order_by_ordername[table_id[0]];
                    }
                    kitchen_order_by_table[kitchen_order.product_tmp_id[0]] = kitchen_order;
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
            if(this.current_orderline_cancel){
                this.current_orderline_cancel = this.pos.current_orderline_cancel;
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
        set_current_orderline_cancel: function(orderline_id) {
            this.current_orderline_cancel = orderline_id;
        },
        get_current_orderline_cancel: function(orderline_id){
            return this.current_orderline_cancel;
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
        export_as_JSON: function() {
            var json = _super_order.export_as_JSON.apply(this,arguments);
            json.has_printbill            = this.has_printbill || false;
            json.current_orderline_cancel = this.current_orderline_cancel || false;
            return json;
        },
        init_from_JSON: function(json) {
            _super_order.init_from_JSON.apply(this,arguments);
            this.has_printbill            = this.pos.tables_by_id[json.table_id].has_printbill;
            this.current_orderline_cancel = this.pos.current_orderline_cancel;
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

            var ordername  = this.order['name'];
            var order_uid  = 'Order '+this.order['uid'];
            var orderuid  = 'Order'+this.order['uid'];

            var table_id   = this.order.table ? this.order.table.id : false;
            var product_id = this.product.product_tmpl_id;

            var orderlines_obj_by_kasir  = options.pos.orderlines_[ordername] || options.pos.orderlines_[order_uid];
            var orderlines_obj_by_waiter = {};
            if ( ordername ===  order_uid){
                orderlines_obj_by_waiter = options.pos.orderlines_[orderuid];
            }
            if ( ordername ===  orderuid){
                orderlines_obj_by_waiter = options.pos.orderlines_[order_uid];
            }
            
            var is_find = false;

            if( orderlines_obj_by_kasir ){
                var orderlines_by_table = orderlines_obj_by_kasir[table_id];
                if( orderlines_by_table ){
                    var orderline_by_product = orderlines_by_table[product_id];
                    if( orderline_by_product ){
                        is_find = true;
                        this.qty_change             = orderline_by_product.qty_change  || 0;
                        this.state_kitchen_order    = orderline_by_product.stage_id[1] || this.state_kitchen_order;
                        this.state_orderline        = orderline_by_product.state_order || this.state_orderline;
                        this.kitchen_orderline_id   = orderline_by_product.id          || this.kitchen_orderline_id;
                    }
                }
            } 
            if( orderlines_obj_by_waiter && !is_find ){
                var orderlines_by_table = orderlines_obj_by_waiter[table_id];
                if( orderlines_by_table ){
                    var orderline_by_product = orderlines_by_table[product_id];
                    if( orderline_by_product ){
                        this.qty_change             = orderline_by_product.qty_change  || 0;
                        this.state_kitchen_order    = orderline_by_product.stage_id[1] || this.state_kitchen_order;
                        this.state_orderline        = orderline_by_product.state_order || this.state_orderline;
                        this.kitchen_orderline_id   = orderline_by_product.id          || this.kitchen_orderline_id;
                    }
                }
            }
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
        set_note: function(note){
            this.update_note_kitchen_order( this.kitchen_orderline_id, note );
            _super_orderline.set_note.apply(this,arguments);
        },

        update_kitchen_order: function(kitchen_orderline_id, qty_change, reason = ""){
            var fields = { 
                'kitchen_order_id': kitchen_orderline_id,
                'qty': qty_change,
                'note': reason,
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
                self.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },

        update_qty_change_kitchen_order: function(kitchen_orderline_id, qty_change){
            var fields = { 
                'kitchen_order_id': kitchen_orderline_id,
                'qty_change': qty_change,
            }
    
            rpc.query({
                model: 'kitchen.order',
                method: 'update_qty_change_kitchen_order',
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
                self.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
            });
        },

        update_note_kitchen_order: function(kitchen_orderline_id, note){
            var fields = { 
                'kitchen_order_id': kitchen_orderline_id,
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
                self.gui.show_popup('error',{
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