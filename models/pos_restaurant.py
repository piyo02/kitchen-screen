from flectra import api, fields, models

class RestaurantTable(models.Model):
    _inherit = 'restaurant.table'

    has_printbill = fields.Boolean('Has Print Bill', default=False)    

    @api.model
    def update_has_printbill(self, value):
        restauran_table = self.env['restaurant.table'].search([
            ('id', '=', value['table_id'])
        ])
        restauran_table.write({
            'has_printbill': value['has_printbill']
        })
        return restauran_table.id

    @api.multi
    def write(self, vals):
        result = super(RestaurantTable, self).write(vals)
        self.send_field_updates(self.ids, self.has_printbill)
        return result


    @api.model
    def send_field_updates(self, table_id, state='', action=''):
        channel_name = "restaurant_table"
        data = {
            'message': 'update_state_order_widget', 
            'table_id': table_id, 
            'action': action, 
            'has_printbill': state
        }
        self.env['pos.config'].send_to_all_poses(channel_name, data)