flectra.define('kitchen_screen.kitchenpos', function (require) {
"use strict";

var screens = require('point_of_sale.screens');
var chrome = require("point_of_sale.chrome");
var gui = require("point_of_sale.gui");
var core = require('web.core');
var rpc = require('web.rpc');

var QWeb = core.qweb;
var _t = core._t;

chrome.OrderSelectorWidget.include({
    deleteorder_click_handler: function(event, $el) {
        var order = this.pos.get_order();
        if (order.is_empty()) {
            if (order.canceled_lines && order.canceled_lines.length) {
                // orderline ada tapi belum di order
                this.gui.screen_instances.products.order_widget.show_popup("order");
            } else {
                // orderline kosong
                this._super(event, $el);
            }
        } else {
            // orderline ada tapi tidak di cancel
            this.gui.screen_instances.products.order_widget.show_popup("order");
        }
    },
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
});

screens.OrderWidget.include({
    set_value: function(val) {
    	var order = this.pos.get_order();
    	if (order.get_selected_orderline()) {
            var mode = this.numpad_state.get('mode');
            if( mode === 'quantity'){
                if( this.pos.get_order().get_has_printbill() ){
                    return this.pos.gui.show_popup('error', {
                        title: '!!! Warning !!!',
                        body: `Meja sudah tutup pesanan!!!`
                    });
                }
                order.get_selected_orderline().set_quantity(val);
                order.get_selected_orderline().set_qty_change(val);
                order.get_selected_orderline().update_qty_change_kitchen_order(
                    order.get_selected_orderline().kitchen_orderline_id,
                    val
                )
            }else if( mode === 'discount'){
                order.get_selected_orderline().set_discount(val);
            }else if( mode === 'price'){
                var selected_orderline = order.get_selected_orderline();
                selected_orderline.price_manually_set = true;
                selected_orderline.set_unit_price(val);
            }
    	}
    },
    show_popup: function(type, line) {
        var self = this;
        if (this.pos.config.ask_managers_pin) {
            // Check for admin rights
            var manager_group_id = this.pos.config.group_pos_manager_id[0];
            var is_manager = _.include(
                this.pos.get_cashier().groups_id,
                manager_group_id
            );
            if (!is_manager) {
                return this.pos.gui
                    .sudo_custom({
                        special_group: manager_group_id,
                        do_not_change_cashier: true,
                        arguments: {
                            ask_untill_correct: true,
                        },
                    })
                    .done(function(user) {
                        self.show_confirm_cancellation_popup(type, line);
                    })
                    .fail(function(res) {
                        if (type === "product") {
                            var order = self.pos.get_order();
                            var orderline = line || order.get_selected_orderline();
                            orderline.cancel_quantity_changes();
                        }
                    });
            }
        }
        return this.show_confirm_cancellation_popup(type, line);
    },
    show_confirm_cancellation_popup: function(type, line) {
        var self = this;
        var order = this.pos.get_order();
        var orderline = line || order.get_selected_orderline();
        
        var kitchen_orderline_id    = orderline ? orderline.kitchen_orderline_id : false;
        
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
                    if( kitchen_orderline_id ){
                        orderline.update_note_kitchen_order(kitchen_orderline_id, reason);
                    }
                }
                if (type === "order") {
                    var orderlines = order.orderlines.models;
                    orderlines.forEach(orderline => {
                        if(orderline.kitchen_orderline_id){
                            orderline.update_kitchen_order(
                                orderline.kitchen_orderline_id, 
                                orderline.quantity,
                                reason
                            );
                            console.log( orderline.kitchen_orderline_id );
                            orderline.set_state_orderline('Cancel');
                        }
                    });
                    order.destroy_and_upload_as_canceled(
                        reason,
                        cancelled_reason_ids
                    );
                }
            },
            cancel: function() {
                if (type === "product") {
                    orderline.cancel_quantity_changes();
                    self.cancel_order_cancelled( orderline.kitchen_orderline_id )
                }
            },
        });
    },

    cancel_order_cancelled: function(kitchen_orderline_id){
        var fields = { 
            'kitchen_order_id': kitchen_orderline_id,
        }

        rpc.query({
            model: 'kitchen.order',
            method: 'cancel_order_cancelled',
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

screens.ActionButtonWidget.include({
    init: function(parent, options) {
        this._super(parent, options);
    },

    save_kitchen_order_details: function(orderline){
        var self = this;
        
        var uid         = orderline.uid;
        var order_name  = orderline.order.name;
        var note        = orderline.note;
        var product_name= orderline.product.display_name;
        var table_name  = orderline.pos.table.name;
        var table_id    = orderline.pos.table.id;
        var product_id  = orderline.product.product_tmpl_id;

        var fields = {
            'description'   : `Order ${product_name} meja ${table_name}`,
            'name'          : `Order ${product_name} meja ${table_name}`,
            'quantity'      : orderline.quantity,
            'table_id'      : table_id,
            'product_id'    : product_id,
            'uid'           : uid,
            'order_name'    : order_name,
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
                if ( orderline.state_orderline == 'New' ){
                    orderline.set_state_orderline(state_orderline);
                    self.save_kitchen_order_details(orderline);
                }
                if ( orderline.get_qty_change() ){
                    var kitchen_order_id = orderline.get_kitchen_orderline_id();
                    var qty_change = orderline.get_qty_change();
                    self.update_qty_kitchen_order(kitchen_order_id, qty_change);
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

screens.NumpadWidget.include({
    clickDeleteLastChar: function() {
        if( this.pos.get_order().get_has_printbill() ){
            return this.pos.gui.show_popup('error', {
                title: '!!! Warning !!!',
                body: `Meja sudah tutup pesanan!!!`
            });
        }
        
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
                    
                    current_line.update_kitchen_order(
                        current_line.kitchen_orderline_id, 
                        value
                    );

                    current_line.trigger("change", current_line);
                    if (new_qty === 0) {
                        self.state.set({
                            buffer: "",
                        });
                        current_line.set_state_orderline('Cancel');
                    }
                },
            });
        } else {
            return this.state.deleteLastChar();
        }
    },
});

var ButtonOpenOrder = screens.ActionButtonWidget.extend({
    template: 'ButtonOpenOrder',
    button_click: function(){
        var self = this;
        var user_is_waiter = self.pos.user.role; 
        console.log(self)
        console.log(user_is_waiter)
        if ( user_is_waiter === 'cashier' ){
            return this.pos.gui.show_popup('error', {
                title: '!!! Warning !!!',
                body: `Meja sudah tutup pesanan dan hanya Kasir yang bisa membuka pesanan!!!`
            });
        }else {
            var table_id = self.pos.table.id;
            rpc.query({
                model: 'restaurant.table',
                method: 'update_has_printbill',
                args: [{'has_printbill': false, 'table_id': table_id}],
            })
            .then(function(table_id){
                self.pos.get_order().set_has_printbill(false);
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
        }
    },
});

screens.define_action_button({
    'name': 'button_open_order',
    'widget': ButtonOpenOrder,
});

});