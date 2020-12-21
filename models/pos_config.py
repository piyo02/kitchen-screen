from flectra import api, fields, models

import logging
_logger = logging.getLogger(__name__)

class PosConfig(models.Model):
    _inherit = "pos.config"

    allow_longpolling_kitchen_order = fields.Boolean(string='Allow Longpolling Kitchen Order', default=True)