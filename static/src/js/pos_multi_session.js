flectra.define("kitchen_order.pos_multi_session", function(require) {
    "use strict";
    var models = require("pos_restaurant_base.models");
    var core = require("web.core");

    var _t = core._t;

    // sync has printbill
    var OrderSuper = models.Order;
    models.Order = models.Order.extend({
        apply_ms_data: function(data) {
            if (data.has_printbill) {
                this.set_has_printbill( data.has_printbill )
            }
            OrderSuper.prototype.apply_ms_data.apply(this, arguments);
        },
    });

    // sync state order, state kitchen order, kitchen order id, qty change
    var OrderlineSuper = models.Orderline;
    models.Orderline = models.Orderline.extend({
        apply_ms_data: function(data) {
            if (data.state_orderline !== "New") {
                this.set_state_orderline(data.state_orderline);
            }
            if (data.state_kitchen_order !== "New") {
                this.set_state_kitchen_order(data.state_kitchen_order);
            }
            if (data.kitchen_orderline_id){
                this.set_kitchen_orderline_id(data.kitchen_orderline_id);
            }
            if(data.qty_change){
                this.set_qty_change(data.qty_change);
            }
            OrderlineSuper.prototype.apply_ms_data.apply(this, arguments);
        },
    });
});
