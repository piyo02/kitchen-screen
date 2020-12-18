from flectra import api, fields, models, tools, SUPERUSER_ID, _
from datetime import datetime, timedelta

import logging
_logger = logging.getLogger(__name__)

class KitchenOrderType(models.Model):
    _name = 'kitchen.order.type'
    _description = 'Kitchen Stage'
    _order = 'sequence, id'

    def _get_default_kitchen_ids(self):
        default_kitchen_id = self.env.context.get('default_kitchen_id')
        return [default_kitchen_id] if default_kitchen_id else None

    name = fields.Char(string='Stage Name', required=True, transalate=True)
    description = fields.Text(transalate=True)
    fold = fields.Boolean(string='Folded in Kanban',
        help='This stage is folded in the kanban view when there are no records in that stage to display.')
    legend_priority = fields.Char(
        string='Starred Explanation', translate=True,
        help='Explanation text to help users using the star on tasks or issues in this stage.')
    legend_blocked = fields.Char(
        'Red Kanban Label', default=lambda s: _('Blocked'), translate=True, required=True,
        help='Override the default value displayed for the blocked state for kanban selection, when the task or issue is in that stage.')
    legend_done = fields.Char(
        'Green Kanban Label', default=lambda s: _('Ready for Next Stage'), translate=True, required=True,
        help='Override the default value displayed for the done state for kanban selection, when the task or issue is in that stage.')
    legend_normal = fields.Char(
        'Grey Kanban Label', default=lambda s: _('In Progress'), translate=True, required=True,
        help='Override the default value displayed for the normal state for kanban selection, when the task or issue is in that stage.')
    sequence = fields.Integer(default=1)
    kitchen_ids = fields.Many2many('kitchen.screen', 'kitchen_screen_type_rel', 'type_id', 'kitchen_id', string='Kitchen Screen',
        default=_get_default_kitchen_ids)

class KitchenScreen(models.Model):
    _name = 'kitchen.screen'

    def _compute_order_count(self):
        count_data = self.env['kitchen.order'].read_group([('kitchen_id', 'in', self.ids), '|', '&' , ('stage_id.fold', '=', False), ('stage_id', '=', False), ('date_order', '>=', str(datetime.today()))], ['kitchen_id'], ['kitchen_id'])
        result = dict((data['kitchen_id'][0], data['kitchen_id_count']) for data in count_data)
        for kitchen_screen in self:
            kitchen_screen.order_count = result.get(kitchen_screen.id, 0)

    active = fields.Boolean(default=True)
    color = fields.Integer(string='Color Index')
    name = fields.Char(string='Kitchen Screen')
    label_orders = fields.Char(string='Use Orders as', default='Orders', help="Gives label to orders on kitchen screen's kanban view.")
    sequence = fields.Integer(string='Sequence', index=True, default=10, help="Gives the sequence order when displaying a list of kitchen screen")
    order_count = fields.Integer(compute='_compute_order_count', string='Order')
    orders = fields.One2many('kitchen.order', 'kitchen_id', string='Order Line')
    order_ids = fields.One2many('kitchen.order', 'kitchen_id', string='Order Line', domain=['|', ('stage_id.fold', '=', False), ('stage_id', '=', False)])
    table_id = fields.Many2one('restaurant.table', string='Tables')
    type_ids = fields.Many2many('kitchen.order.type', 'kitchen_screen_type_rel', 'kitchen_id', 'type_id', string='Tasks Stages')
    user_id = fields.Many2one('res.users', string='Chief Chef', default=lambda self: self.env.user, track_visibility="onchange")
    displayed_image_id = fields.Many2one('ir.attachment',
        domain="[('res_model', '=', 'project.project'), ('res_id', '=', id), ('mimetype', 'ilike', 'image')]",
        string='Cover Image')

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
    def _compute_time_w2s(self):
        if self.served_date and self.waiting_date:
            diff_time = datetime.strptime(self.served_date, '%Y-%m-%d %H:%M:%S') - datetime.strptime(self.waiting_date, '%Y-%m-%d %H:%M:%S')
            self.time = diff_time.total_seconds()

    order_name = fields.Char('Order Name')
    cid = fields.Char('cid')
    state_order = fields.Char('State Order')
    active = fields.Boolean(default=True)
    color = fields.Integer(string='Color Index') #
    date_end = fields.Datetime('End Time', index=True, copy=False) #terisi ketika statenya served
    date_order = fields.Datetime('Order Date', index=True, copy=False) #terisi ketika order dibuat
    waiting_date = fields.Datetime('Waiting Date', index=True, copy=False) #terisi ketika statenya waiting
    preparing_date = fields.Datetime('Preparing Date', index=True, copy=False) #terisi ketika statenya preparing
    served_date = fields.Datetime('Served Date', index=True, copy=False) #terisi ketika statenya served
    description = fields.Html(string='Description')
    displayed_image_id = fields.Many2one('ir.attachment', domain="[('res_model', '=', 'kitchen.order'), ('res_id', '=', id), ('mimetype', 'ilike', 'image')]", string='Cover Image')
    kanban_state = fields.Selection([
        ('normal', 'Grey'),
        ('done', 'Green'),
        ('blocked', 'Red')], string='Kanban State',
        copy=False, default='normal', required=True )
    legend_blocked = fields.Char(related='stage_id.legend_blocked', string='Kanban Blocked Explanation', readonly=True, related_sudo=False)
    legend_done = fields.Char(related='stage_id.legend_done', string='Kanban Valid Explanation', readonly=True, related_sudo=False)
    legend_normal = fields.Char(related='stage_id.legend_normal', string='Kanban Ongoing Explanation', readonly=True, related_sudo=False)
    name = fields.Char(string='Order')
    quantity = fields.Integer('Quantity', default=1)
    sequence = fields.Integer(string='Sequence', index=True, default=10)
    time = fields.Float('Total Time', default=0, compute='_compute_time_w2s') #date_server - date_waiting
    employee_id = fields.Many2one('hr.employee', string='Chef')
    kitchen_id = fields.Many2one('kitchen.screen', string='Kitchen Screen')
    product_tmp_id = fields.Many2one('product.template', string='Product')
    tag_ids = fields.Many2many('kitchen.tags', string='Tags', oldname='categ_ids')
    stage_id = fields.Many2one('kitchen.order.type', string='Stage', track_visibility='onchange', index=True,
        default=_get_default_stage_id, group_expand='_read_group_stage_ids',
        domain="[('kitchen_ids', '=', kitchen_id)]", copy=False)

    def action_assign_to_me(self):
        self.write({'employee_id': self.env.user.id})

    @api.onchange('stage_id')
    def change_stage(self):
        color = 4
        if self.stage_id.name in ['Waiting', 'Preparing', 'Served', 'Void']:
            color = 3
            if not self.waiting_date:
                self.waiting_date = self.get_current_time_idn()
        
        if self.stage_id.name in ['Preparing', 'Served', 'Void']:
            color = 3
            if not self.preparing_date:
                self.preparing_date = self.get_current_time_idn()
        
        if self.stage_id.name in ['Served', 'Void']:
            color = 10
            if not self.served_date:
                self.served_date = self.get_current_time_idn()
                self._compute_time_w2s()
        
        if self.stage_id.name in ['Void']:
            color = 1
            if not self.date_end:
                self.date_end = self.get_current_time_idn()
                self._compute_time_w2s()
        
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
        product = self.env['product.template'].search([
            ('id', '=', orderline['product_id'])
        ])
        date_order = self.get_current_time_idn()
        kitchenOrderSudo = self.env['kitchen.order'].sudo()
        value = {
            'cid': orderline['cid'],
            'order_name': orderline['order_name'],
            'state_order': "Ordered",
            'color': 4,
            'date_order': date_order,
            'description': orderline['description'],
            'name': orderline['name'],
            'quantity': orderline['quantity'],
            'kitchen_id': kitchen.id,
            'product_tmp_id': product.id,
            'stage_id': stage_new.id,

        }
        kitchen_order = kitchenOrderSudo.create(value)
        return kitchen_order.id

    @api.model
    def update_kitchen_order(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id'])
        ])
        
        quantity = kitchen_order.quantity

        kitchenOrderSudo = self.env['kitchen.order'].sudo()
        stage_cancel = stage_new = self.env['kitchen.order.type'].search([
            ('name', '=', 'Void'),
            ('kitchen_ids.id', '=', kitchen_order.kitchen_id.id)
        ])

        value_update = {
            'quantity': value['quantity']
        }
        if not value['split']:
            value_update = {
                'color': 1,
                'quantity': quantity,
                'stage_id': stage_cancel.id,
                'name': kitchen_order.name + ' cancel',
                'state_order': 'Cancel',
            }
        kitchen_order.write(value_update)
        if value['split']:
            value = {
                'cid': value['cid'],
                'color': 1,
                'order_name': kitchen_order.order_name,
                'date_order': kitchen_order.date_order,
                'date_end': self.get_current_time_idn(),
                'description': kitchen_order.description,
                'name': kitchen_order.name + ' cancel',
                'quantity': quantity - value['quantity'],
                'kitchen_id': kitchen_order.kitchen_id.id,
                'product_tmp_id': kitchen_order.product_tmp_id.id,
                'stage_id': stage_cancel.id,

            }
            kitchen_order = kitchenOrderSudo.create(value)
        return kitchen_order.id

    @api.model
    def save_description_void(self, value):
        kitchen_order = self.env['kitchen.order'].search([
            ('id', '=', value['kitchen_order_id'])
        ]).write({
            'description': value['description']
        })
        return value['kitchen_order_id']
    
    def get_current_time_idn(self):
        return datetime.now() + timedelta(hours=8)


class KitchenTags(models.Model):
    _name = 'kitchen.tags'

    name = fields.Char(required=True)
    color = fields.Integer(string='Color Index', default=10)

    _sql_constraints = [
        ('name_uniq', 'unique (name)', "Tag name already exists !"),
    ]