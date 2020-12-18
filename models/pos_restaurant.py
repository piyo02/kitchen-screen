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