from flectra import api, fields, models, tools, SUPERUSER_ID, _
from datetime import datetime, timedelta

import logging
_logger = logging.getLogger(__name__)

class KitchenOrderType(models.Model):
    _name = 'kitchen.order.type'
    _description = 'Kitchen Stage'
    _order = 'id'

    def _get_default_kitchen_ids(self):
        default_kitchen_id = self.env.context.get('default_kitchen_id')
        return [default_kitchen_id] if default_kitchen_id else None

    name = fields.Char(string='Stage Name', required=True, transalate=True)
    description = fields.Text(transalate=True)
    fold = fields.Boolean(string='Folded in Kanban',
        help='This stage is folded in the kanban view when there are no records in that stage to display.')
    kitchen_ids = fields.Many2many('kitchen.screen', 'kitchen_screen_type_rel', 'type_id', 'kitchen_id', string='Kitchen Screen',
        default=_get_default_kitchen_ids)

class KitchenScreen(models.Model):
    _name = 'kitchen.screen'
    _order = 'sequence, id'

    def _compute_order_count(self):
        count_data = self.env['kitchen.order'].read_group([
            ('kitchen_id', 'in', self.ids), 
            '&', '&' , 
            ('stage_id.fold', '=', False), 
            ('date_order', '>=', str(datetime.now().replace(hour=0,minute=0,second=0,microsecond=0))),
            ('stage_id.name', '=', "New"), 
        ], ['kitchen_id'], ['kitchen_id'])
        
        result = dict((data['kitchen_id'][0], data['kitchen_id_count']) for data in count_data)
        for kitchen_screen in self:
            kitchen_screen.order_count = result.get(kitchen_screen.id, 0)

    color = fields.Integer(string='Color Index')
    name = fields.Char(string='Kitchen Screen')
    label_orders = fields.Char(string='Use Orders as', default='Orders', help="Gives label to orders on kitchen screen's kanban view.")
    order_count = fields.Integer(compute='_compute_order_count', string='Order')
    order_ids = fields.One2many('kitchen.order', 'kitchen_id', string='Order Line', domain=['|', ('stage_id.fold', '=', False), ('stage_id', '=', False)])
    table_id = fields.Many2one('restaurant.table', string='Tables')
    type_ids = fields.Many2many('kitchen.order.type', 'kitchen_screen_type_rel', 'kitchen_id', 'type_id', string='Tasks Stages')
    user_id = fields.Many2one('res.users', string='Chief Chef', default=lambda self: self.env.user, track_visibility="onchange")
    displayed_image_id = fields.Many2one('ir.attachment',
        domain="[('res_model', '=', 'project.project'), ('res_id', '=', id), ('mimetype', 'ilike', 'image')]",
        string='Cover Image')
    sequence = fields.Integer(string='Sequence', index=True, default=10, help="Gives the sequence order when displaying a list of kitchen screen")

    @api.multi
    def close_dialog(self):
        return {'type': 'ir.actions.act_window_close'}

    @api.multi
    def edit_dialog(self):
        form_view = self.env.ref('kitchen_screen.edit_kitchen_screen')
        return {
            'name': _('Kitchen Screen'),
            'res_model': 'kitchen.screen',
            'res_id': self.id,
            'views': [(form_view.id, 'form'),],
            'type': 'ir.actions.act_window',
            'target': 'inline'
        }
    

class KitchenOrder(models.Model):
    _name = 'kitchen.order'

    @api.model
    def _read_group_stage_ids(self, stages, domain, order):
        search_domain = [('id', 'in', stages.ids)]
        if 'default_kitchen_id' in self.env.context:
            search_domain = ['|', ('kitchen_ids', '=', self.env.context['default_kitchen_id'])] + search_domain

        stage_ids = stages._search(search_domain, order=order, access_rights_uid=SUPERUSER_ID)
        return stages.browse(stage_ids)

    def _get_default_stage_id(self):
        kitchen_id = self.env.context.get('default_kitchen_id')
        if not kitchen_id:
            return False
        return self.stage_find(kitchen_id, [('fold', '=', False)])

    def stage_find(self, section_id, domain=[], order='sequence'):
        # collect all section_ids
        section_ids = []
        if section_id:
            section_ids.append(section_id)
        section_ids.extend(self.mapped('kitchen_id').ids)
        
        search_domain = []
        if section_ids:
            search_domain = [('|')] * (len(section_ids) - 1)
            for section_id in section_ids:
                search_domain.append(('kitchen_ids', '=', section_id))
        search_domain += list(domain)
        # perform search, return the first found
        return self.env['kitchen.order.type'].search(search_domain, order=order, limit=1).id

    @api.one
    def _compute_time_w2s(self, kitchen_order_id):
        KitchenOrderSudo = self.env['kitchen.order'].sudo().search([
            ('id', '=', kitchen_order_id)
        ])
        time = ['Waktu Penyajian']
        if KitchenOrderSudo.served_date and KitchenOrderSudo.waiting_date:
            served_date  = datetime.strptime(KitchenOrderSudo.served_date, '%Y-%m-%d %H:%M:%S')
            waiting_date = datetime.strptime(KitchenOrderSudo.waiting_date, '%Y-%m-%d %H:%M:%S')
            total_seconds= (served_date - waiting_date).total_seconds()
            
            hours   = str( int( total_seconds//3600 ) )
            minutes = str( int( (total_seconds%3600)//60 ) )
            seconds = str( int( (total_seconds%3600)%60 )  )
            time = '{} Jam {} Menit {} Detik'.format(hours,minutes,seconds)
        return time

    @api.multi
    def write(self, vals):
        result = super(KitchenOrder, self).write(vals)
        self.send_field_updates(self.ids, self.stage_id.name, self.has_printbill)
        return result

    @api.model
    def create(self, vals):
        kitchen_order = super(KitchenOrder, self).create(vals)
        self.send_field_updates(kitchen_order.id, kitchen_order.stage_id.name)
        return kitchen_order

    @api.model
    def send_field_updates(self, kitchen_order_ids, state='', has_printbill=False, action=''):
        channel_name = "kitchen_screen"
        data = {
            'message': 'update_kitchen_order_fields', 
            'action': action, 
            'kitchen_order_ids': kitchen_order_ids, 
            'state_kitchen_order': state,
            'has_printbill': has_printbill
        }
        self.env['pos.config'].send_to_all_poses(channel_name, data)

    name = fields.Char(string='Order')
    uid = fields.Char('uid')
    has_printbill = fields.Boolean('Has Print Bill', default=False)    

    color = fields.Integer(string='Color Index') 
    old_color = fields.Integer(string='Old Color Index')

    date_end = fields.Datetime('End Time')
    date_order = fields.Datetime('Order Date')
    waiting_date = fields.Datetime('Waiting Date')
    preparing_date = fields.Datetime('Preparing Date')
    served_date = fields.Datetime('Served Date' )
    time = fields.Char('Total Time')
    
    note = fields.Html(string='Note Order')
    reason_cancel = fields.Html(string='Reason Cancel')

    stage_id = fields.Many2one('kitchen.order.type', string='Stage', track_visibility='onchange', index=True,
        default=_get_default_stage_id, group_expand='_read_group_stage_ids',
        domain="[('kitchen_ids', '=', kitchen_id)]", copy=False)
    old_stage_id = fields.Many2one('kitchen.order.type', string='Old Stage')

    quantity = fields.Integer('Quantity', default=1)
    qty_cancel = fields.Integer('Quantity Cancel', default=0)

    displayed_image_id = fields.Many2one('ir.attachment', domain="[('res_model', '=', 'kitchen.order'), ('res_id', '=', id), ('mimetype', 'ilike', 'image')]", string='Cover Image')
    employee_id = fields.Many2one('hr.employee', string='Chef')
    kitchen_id = fields.Many2one('kitchen.screen', string='Kitchen Screen')
    product_tmp_id = fields.Many2one('product.template', string='Product')
    tag_ids = fields.Many2many('kitchen.tags', string='Tags', oldname='categ_ids')


    def action_assign_to_me(self):
        self.write({'employee_id': self.env.user.id})

    @api.onchange('stage_id')
    def change_stage(self):
        KitchenOrderSudo = self.env['kitchen.order'].sudo().search([
            ('id', '=', self._origin.id)
        ])
        color = 4

        if self.stage_id.name in ['Waiting', 'Preparing', 'Served', 'Void']:
            if not KitchenOrderSudo.waiting_date:
                KitchenOrderSudo.write({'waiting_date': self.get_current_time_idn()})
                color = 3
        if self.stage_id.name in ['Preparing', 'Served', 'Void']:
            if not KitchenOrderSudo.preparing_date:
                KitchenOrderSudo.write({'preparing_date': self.get_current_time_idn()})
                color = 3
        if self.stage_id.name in ['Void']:
            if not KitchenOrderSudo.date_end:
                KitchenOrderSudo.write({
                    'date_end': self.get_current_time_idn(),
                    'quantity': 0,
                    'qty_cancel': KitchenOrderSudo.quantity,
                })
                color = 1
        if self.stage_id.name in ['Served']:
            if not KitchenOrderSudo.served_date:
                KitchenOrderSudo.write({
                    'date_end': self.get_current_time_idn(),
                    'served_date': self.get_current_time_idn()
                })
                time = self._compute_time_w2s(KitchenOrderSudo.id)
                KitchenOrderSudo.write({'time': time[0]})
                color = 10
        
        self.color = color

    @api.model
    def create_from_ui(self, orderline):
        kitchen = self.env['kitchen.screen'].search([
            ('table_id' ,'=', orderline['table_id'])
        ])
        stage_new = self.env['kitchen.order.type'].search([
            ('name', '=', 'New'),
            ('kitchen_ids.id', '=', kitchen.id)
        ])
        date_order = self.get_current_time_idn()
        kitchenOrderSudo = self.env['kitchen.order'].sudo()
        value = {
            'color': 4,
            'date_order'    : date_order,
            'kitchen_id'    : kitchen.id,
            'name'          : orderline['name'],
            'product_tmp_id': orderline['product_id'],
            'quantity'      : orderline['quantity'],
            'stage_id'      : stage_new.id,
            'uid'           : orderline['uid'],
            'note'          : orderline['note'],
        }
        kitchen_order = kitchenOrderSudo.create(value)
        return kitchen_order.id

    @api.model
    def update_kitchen_order(self, value):
        kitchenOrderSudo = self.env['kitchen.order'].sudo()
        kitchen_order = kitchenOrderSudo.search([
            ('id', '=', value['kitchen_order_id'])
        ])
        stage_cancel = stage_new = self.env['kitchen.order.type'].search([
            ('name', '=', 'Void'),
            ('kitchen_ids.id', '=', kitchen_order.kitchen_id.id)
        ])

        curr_color = kitchen_order.color
        curr_stage_id = kitchen_order.stage_id.id
        qty_cancel = 0 if value['qty'] == '' else int(value['qty'])
        quantity = kitchen_order.quantity - qty_cancel

        if quantity == 0:
            qty_cancel = kitchen_order.qty_cancel + qty_cancel
            color = 1
            stage_id = stage_cancel.id
            old_color = curr_color
            old_stage_id = curr_stage_id
            reason_cancel = value['reason_cancel']
        else:
            color = curr_color
            stage_id = curr_stage_id
            old_color = 0
            old_stage_id = False
            reason_cancel = ''

        value_update = {
            'old_color'     : old_color,
            'old_stage_id'  : old_stage_id,
            'color'         : color,
            'quantity'      : quantity,
            'qty_cancel'    : qty_cancel,
            'stage_id'      : stage_id,
            'reason_cancel' : reason_cancel,
        }
        kitchen_order.write(value_update)
        return kitchen_order.id

    @api.model
    def update_has_printbill(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id']),
        ])
        kitchen_order.write({
            'has_printbill': value['has_printbill']
        })
        return kitchen_order.id

    @api.model
    def cancel_order_cancelled(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id']),
        ])
        quantity = kitchen_order.quantity + kitchen_order.qty_cancel

        if not kitchen_order.quantity:
            color = kitchen_order.old_color
            stage_id = kitchen_order.old_stage_id.id
        else:
            color = kitchen_order.color
            stage_id = kitchen_order.stage_id.id
        
        value_update = {
            'color'         : color,
            'quantity'      : quantity, 
            'stage_id'      : stage_id, 
            'qty_cancel'    : 0,
        }
        kitchen_order.write( value_update )
        return kitchen_order.id
    
    @api.model
    def update_reason_cancel_kitchen_order(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id']),
        ])
        update = {
            'reason_cancel': value['reason_cancel']
        }
        kitchen_order.write(update)
        return kitchen_order.id

    @api.model
    def update_qty_kitchen_order(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id']),
        ])
        update = {
            'quantity': value['qty_change']
        }
        kitchen_order.write(update)
        return kitchen_order.id

    @api.model
    def update_note_kitchen_order(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id']),
        ])
        kitchen_order.write({
            'note': value['note']
        })
        return kitchen_order

    def get_current_time_idn(self):
        # return datetime.now() + timedelta(hours=8)
        return datetime.now()


class KitchenTags(models.Model):
    _name = 'kitchen.tags'

    name = fields.Char(required=True)
    color = fields.Integer(string='Color Index', default=10)

    _sql_constraints = [
        ('name_uniq', 'unique (name)', "Tag name already exists !"),
    ]