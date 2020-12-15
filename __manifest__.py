{
    'name': 'Kitchen Screen',
    'author': 'technoindo.com',
    'version': '1.1',
    'category': 'Point Of Sale',
    'description': """
Modul Kitchen Screen Flectra
""",
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [
        # 'security/ir.model.access.csv',
        'views/kitchen_screen_templates.xml',
        'views/kitchen_screen.xml',
    ],
    'qweb': [
        # 'static/src/xml/openorder.xml',
        'static/src/xml/kitchenpos.xml',
    ],
    'installable': True,
    'auto_install': False,
}
