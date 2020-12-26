flectra.define('kitchen_screen.kitchenpos', function (require) {
"use strict";

var screens = require('point_of_sale.screens');
var core = require('web.core');
var rpc = require('web.rpc');

var QWeb = core.qweb;
var _t = core._t;

// ketika tambah produk tetapi status order sudah close
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
    // ketika set qty tetapi status order sudah close
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
            }else if( mode === 'discount'){
                order.get_selected_orderline().set_discount(val);
            }else if( mode === 'price'){
                var selected_orderline = order.get_selected_orderline();
                selected_orderline.price_manually_set = true;
                selected_orderline.set_unit_price(val);
            }
    	}
    },
    // popup ketika cancel qty
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
    // popup reason cancel
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
                    if( kitchen_orderline_id && reason ){
                        orderline.update_reason_cancel_kitchen_order(kitchen_orderline_id, reason);
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

    // mengembalikan order yang telah dicancel
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

    renderElement: function() {
        var self = this;
        this._super();

        // tombol bill ditekan
        $('.order-printbill').click(function(){
            var table_id = self.pos.table.id;
            var has_printbill = self.pos.get_order().get_has_printbill();
            if ( !has_printbill ){
                self.pos.get_order().set_has_printbill(true);
                self.pos.get_order().update_has_printbill(table_id, true);
            }
        });

        // menampilkan atau menyembunyikan tombol open order
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
    // popup qty yang akan dicancel
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

// membuka status close order
var ButtonOpenOrder = screens.ActionButtonWidget.extend({
    template: 'ButtonOpenOrder',
    button_click: function(){
        var self = this;
        var user_is_waiter = self.pos.user.name; 
        if ( user_is_waiter === 'Waiterss' || user_is_waiter === 'Waiterss2' ){
            return this.pos.gui.show_popup('error', {
                title: '!!! Warning !!!',
                body: `Meja sudah tutup pesanan dan hanya Kasir yang bisa membuka pesanan!!!`
            });
        }else {
            var has_printbill = self.pos.get_order().get_has_printbill();
            var table_id = self.pos.table.id;
            if ( has_printbill ){
                self.pos.get_order().set_has_printbill(false);
                self.pos.get_order().update_has_printbill(table_id, false);
            }
        }
    },
});

screens.define_action_button({
    'name': 'button_open_order',
    'widget': ButtonOpenOrder,
});

});