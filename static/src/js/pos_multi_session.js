flectra.define("kitchen_order.pos_multi_session", function(require) {
    "use strict";
    var models = require("pos_restaurant_base.models");
    var core = require("web.core");

    var _t = core._t;

    var OrderlineSuper = models.Orderline;
    models.Orderline = models.Orderline.extend({
        apply_ms_data: function(data) {
            if (typeof data.state_orderline !== "New") {
                this.set_state_orderline(data.state_orderline);
            }
            if (typeof data.state_kitchen_order !== "New") {
                this.set_state_kitchen_order(data.state_kitchen_order);
            }
            OrderlineSuper.prototype.apply_ms_data.apply(this, arguments);
        },
    });
});
