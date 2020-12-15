flectra.define('kitchen_screen.openorder', function (require) {
    
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var core = require('web.core');

    var OpenOrderButton = screens.ActionButtonWidget.extend({
        'template': 'OpenOrderButton',
        button_click: function(){
            console.log("line: ");
        },
    });

    screens.define_action_button({
        'name': 'open_order',
        'widget': OpenOrderButton,
        'condition': function() {
            return this.pos.config.iface_open_order;
        }
    })
});
