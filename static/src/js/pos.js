flectra.define("kitchen_screen.pos", function(require) {
    "use strict";

    var screens = require('point_of_sale.screens');
    var db = require('point_of_sale.DB');
    var models = require('point_of_sale.models');
    var gui = require('point_of_sale.gui');
    var rpc = require('web.rpc');

    var PosModelSuper = models.PosModel;
    models.PosModel = models.PosModel.extend({
        initialize: function(){
            PosModelSuper.prototype.initialize.apply(this, arguments);
            var self = this;
            this.ready.then(function () {
                self.bus.add_channel_callback("kitchen_screen", self.orderline_state_updates, self);
                self.bus.add_channel_callback("restaurant_table", self.state_order_table_id, self);
            });
        },
        orderline_state_updates: function(data){
            var self = this;
            if (data.message === 'update_kitchen_order_fields') {
                var def = new $.Deferred();
                if (data.action && data.action === 'unlink') {
                    console.log('unlink');
                } else {
                    // def = self.load_update_kitchen_orders(data.kitchen_order_ids);
                    var opened_products_list_screen = self.gui.get_current_screen() === 'products' && self.gui.screen_instances.products;
                    if (opened_products_list_screen){
                        var kitchen_order_id = data.kitchen_order_ids[0];
                        var state_kitchen_order = data.state_kitchen_order;
                        
                        var orderlines = self.get_order().orderlines;
                        var orderline = false;
                        
                        orderlines.forEach(o => {
                            if( o.kitchen_orderline_id === kitchen_order_id ){
                                orderline = o;
                            }
                        });

                        if( orderline ){
                            orderline.set_state_kitchen_order( state_kitchen_order );
                            orderline.set_note( note );
                        }
                    }
                }

            }
        },
        state_order_table_id: function(data){
            var self = this;
            if (data.message === 'update_state_order_widget') {
                var def = new $.Deferred();
                if (data.action && data.action === 'unlink') {
                    console.log('unlink');
                } else {
                    var opened_products_list_screen = self.gui.get_current_screen() === 'products' && self.gui.screen_instances.products;
                    if (opened_products_list_screen){
                        var table_id = data.table_id[0];
                        var has_printbill = data.has_printbill;
                        
                        var order_widget = self.table.id === table_id ? self.table : false;
                        if( order_widget ){
                            self.get_order().set_has_printbill( has_printbill );
                        }
                    }
                }

            }
        }

    });
});
