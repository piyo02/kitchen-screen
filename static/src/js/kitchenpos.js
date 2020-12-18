flectra.define('kitchen_screen.kitchenpos', function (require) {
"use strict";

var models = require('point_of_sale.models');
var screens = require('point_of_sale.screens');
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
    model: "kitchen.order",
    fields: ['id', 'cid', 'state_order', 'stage_id', 'order_name', 'date_order'],
    domain: function(self){ 
        var date_order = self.pos_session.start_at.split(" ")[0] + " 00:00:00";
        console.log(date_order);
        return [['date_order', '>=', date_order]] 
    },
    loaded: function(self, kitchen_orders){
        self.orderlines_ = {}
        for (var i = 0; i < kitchen_orders.length; i++){
            var kitchen_order = kitchen_orders[i];
            var kitchen_order_obj = self.orderlines_[kitchen_order.order_name];
            if (!kitchen_order_obj){
                self.orderlines_[kitchen_order.order_name] = {}
                var kitchen_order_obj = self.orderlines_[kitchen_order.order_name];
            }
            kitchen_order_obj[kitchen_order.cid] = kitchen_order;
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
        this.has_printbill = state
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
        var orderline = options.pos.orderlines_[this.order['name']][this.cid];
        if( orderline ){
            this.state_kitchen_order = orderline.stage_id[1] || "New";
            this.state_orderline = orderline.state_order || 'New';
            this.kitchen_orderline_id = orderline.id || false;
        }
    },
    set_state_orderline: function(state_orderline){
        this.state_orderline = state_orderline;
        this.trigger('change', this);
    },
    get_state_orderline: function(state_orderline){
        return this.state_orderline;
    },
    set_kitchen_orderline_id: function(kitchen_orderline_id){
        this.kitchen_orderline_id = kitchen_orderline_id;
        this.trigger('change', this);
    },
    get_state_kitchen_order: function(state_kitchen_order){
        return this.state_kitchen_order;
    },
    get_kitchen_orderline_id: function(kitchen_orderline_id){
        return this.kitchen_orderline_id;
    },
    export_as_JSON: function(){
        var json = _super_orderline.export_as_JSON.apply(this, arguments);
        json.state_orderline = this.state_orderline;
        json.kitchen_orderline_id = this.kitchen_orderline_id;
        json.state_kitchen_order = this.state_kitchen_order;
        return json;
    },
    init_from_JSON: function(json){
        this.state_orderline = json.state_orderline;
        this.kitchen_orderline_id = json.kitchen_orderline_id;
        this.state_kitchen_order = json.state_kitchen_order;
        _super_orderline.init_from_JSON.call(this, json);
    },
});

screens.OrderWidget.include({
    show_confirm_cancellation_popup: function(type, line) {
        var self = this;
        var order = this.pos.get_order();
        var orderline = line || order.get_selected_orderline();
        var title = "Order ";
        if (type === "product") {
            if (!orderline) {
                return false;
            }
            title = "Product ";
        }
        // Type of object which is removed (product or order)
        return self.gui.show_popup("confirm-cancellation", {
            title: _t(title + "Cancellation Reason"),
            reasons: self.pos.cancelled_reason,
            value: self.pos.selected_cancelled_reason.name,
            type: type,
            confirm: function(reason, cancelled_reason_ids) {
                if (type === "product") {
                    order.save_reason_cancelled_line(
                        orderline,
                        reason,
                        cancelled_reason_ids
                    );

                    self.save_description_void(reason)
                }
                if (type === "order") {
                    order.destroy_and_upload_as_canceled(
                        reason,
                        cancelled_reason_ids
                    );
                }
            },
            cancel: function() {
                if (type === "product") {
                    orderline.cancel_quantity_changes();
                }
            },
        });
    },

    save_description_void: function(description){
        
        var kitchen_orderline_id = this.pos.get_order().get_current_orderline_cancel();
        var fields = { 
            'description': description,
            'kitchen_order_id': kitchen_orderline_id,
        }

        rpc.query({
            model: 'kitchen.order',
            method: 'save_description_void',
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
});

screens.NumpadWidget.include({
    clickDeleteLastChar: function() {
        var self = this;
        var mode = this.state.get("mode");
        var order = self.pos.get_order();
        var current_line = order.get_selected_orderline();
        if (
            this.pos.config.show_popup_change_quantity &&
            mode === "quantity" &&
            current_line &&
            current_line.quantity !== 0
        ) {
            this.gui.show_popup("number", {
                title: _t("Quantity for Cancellation"),
                value: 1,
                confirm: function(value) {
                    order.ask_cancel_reason = true;
                    var new_qty = current_line.quantity - value;
                    current_line.set_quantity(new_qty);
                    var kitchen_orderline_id = current_line.get_kitchen_orderline_id();
                    var cid = current_line.cid;
                    if (new_qty > 0){
                        self.update_kitchen_order(kitchen_orderline_id, cid, new_qty, true);
                    }

                    current_line.trigger("change", current_line);
                    if (new_qty === 0) {
                        self.update_kitchen_order(kitchen_orderline_id, cid);
                        self.state.set({
                            buffer: "",
                        });
                    }
                },
            });
        } else {
            return this.state.deleteLastChar();
        }
    },

    update_kitchen_order: function( kitchen_orderline_id, cid, quantity=0, split=false ){
        var self = this;

        var fields = {
            'kitchen_order_id': kitchen_orderline_id,
            'split': split,
            'quantity': quantity,
            'cid': cid,
        };

        rpc.query({
            model: 'kitchen.order',
            method: 'update_kitchen_order',
            args: [fields],
        })
        .then(function(kitchen_orderline_id){
            self.pos.get_order().set_current_orderline_cancel(kitchen_orderline_id);
            return 'succes update kitchen order';
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
});

screens.ActionButtonWidget.include({
    init: function(parent, options) {
        this._super(parent, options);
    },

    save_kitchen_order_details: function(orderline){
        var self = this;
        var d = new Date;

        var cid = orderline.cid;
        var order_name = orderline.order.name;
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
            'cid': cid,
            'order_name': order_name,
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

    renderElement: function() {
        var self = this;
        var btnOpenOrder = $('.open-order');
        this._super();
        $('.order-submit').click(function(){
            var orderlines = self.pos.get_order().orderlines;
            orderlines.forEach(orderline => {
                var state_orderline = 'Ordered';
                if (orderline.state_orderline == 'New'){
                    orderline.set_state_orderline(state_orderline);
                    self.save_kitchen_order_details(orderline);
                }
            });
        });

        $('.order-printbill').click(function(){
            var table_id = self.pos.table.id;
            rpc.query({
                model: 'restaurant.table',
                method: 'update_has_printbill',
                args: [{'has_printbill': true, 'table_id': table_id}],
            })
            .then(function(table_id){
                self.pos.get_order().set_has_printbill(true);
                btnOpenOrder.removeAttr('style');
                var state_has_printbill = self.pos.get_order().get_has_printbill();
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
        });

        if(self.pos.get_order()){
            var has_printbill = self.pos.get_order().get_has_printbill();
            if ( has_printbill ){
                $('.open-order').removeAttr('style');
            }else {
                $('.open-order').css('display', 'none');
            }
        }
    }
});

screens.ProductScreenWidget.include({
    click_product: function(product) {
        if(product.to_weight && this.pos.config.iface_electronic_scale){
            this.pos.gui.show_screen('scale',{product: product});
        }else{
            if( !this.pos.get_order().get_has_printbill() ){
                this.pos.get_order().add_product(product);
            }else {
                return this.pos.gui.show_popup('error', {
                    title: '!!! Warning !!!',
                    body: `Meja sudah tutup pesanan!!!`
                });
            }
        }
    },
})

var ButtonOpenOrder = screens.ActionButtonWidget.extend({
    template: 'ButtonOpenOrder',
    button_click: function(){
        var self = this;
        var table_id = self.pos.table.id;
        rpc.query({
            model: 'restaurant.table',
            method: 'update_has_printbill',
            args: [{'has_printbill': false, 'table_id': table_id}],
        })
        .then(function(table_id){
            self.pos.get_order().set_has_printbill(false);
            $('.open-order').css('display', 'none');
            var state_has_printbill = self.pos.get_order().get_has_printbill();
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
});

screens.define_action_button({
    'name': 'button_open_order',
    'widget': ButtonOpenOrder,
});

});