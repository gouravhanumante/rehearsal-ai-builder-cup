export type ImportKind = 'stock' | 'orders' | 'shipments'
export type FieldType = 'text' | 'quantity' | 'date' | 'priority'
export type ImportField = { key: string; label: string; type: FieldType; required: boolean; aliases: string[] }

const location = (aliases: string[] = []): ImportField => ({ key: 'location', label: 'Location', type: 'text', required: true, aliases: ['location', 'site', 'store', 'warehouse', 'branch', 'outlet', 'depot', 'dc', 'shipsfrom', ...aliases] })
const product: ImportField = { key: 'product', label: 'Product', type: 'text', required: true, aliases: ['product', 'productname', 'item', 'itemname', 'sku', 'article', 'description'] }
const quantity = (aliases: string[] = []): ImportField => ({ key: 'quantity', label: 'Quantity', type: 'quantity', required: true, aliases: ['quantity', 'qty', 'units', 'cases', 'count', ...aliases] })
const ref = (aliases: string[]): ImportField => ({ key: 'ref', label: 'Reference (to group several lines)', type: 'text', required: false, aliases })

/** What each kind of file can fill in. The backend only ever suggests these keys. */
export const importKinds: Record<ImportKind, { label: string; description: string; fields: ImportField[] }> = {
  stock: {
    label: 'Stock counts',
    description: 'How much of each product is at each location.',
    fields: [location(['arrivingat']), product, quantity(['onhand', 'stock', 'available', 'balance'])],
  },
  orders: {
    label: 'Customer orders',
    description: 'Open orders and when they are due. Rows with the same reference become lines of one order.',
    fields: [
      ref(['order', 'orderid', 'orderno', 'ordernumber', 'orderref', 'reference', 'ref', 'ponumber', 'po']),
      { key: 'customer', label: 'Customer', type: 'text', required: true, aliases: ['customer', 'customername', 'client', 'buyer', 'account', 'soldto'] },
      product,
      quantity(['quantityordered', 'orderqty', 'ordered']),
      { key: 'due', label: 'Due date', type: 'date', required: true, aliases: ['due', 'duedate', 'duedatetime', 'deliverydate', 'deliveryby', 'requireddate', 'requiredby', 'needby'] },
      location(),
      { key: 'priority', label: 'Priority', type: 'priority', required: false, aliases: ['priority', 'urgent', 'protected', 'vip'] },
    ],
  },
  shipments: {
    label: 'Incoming shipments',
    description: 'What suppliers are sending and when. Rows with the same reference become lines of one shipment.',
    fields: [
      ref(['shipment', 'shipmentid', 'shipmentno', 'asn', 'reference', 'ref', 'ponumber', 'po', 'id']),
      { key: 'supplier', label: 'Supplier', type: 'text', required: true, aliases: ['supplier', 'suppliername', 'vendor', 'vendorname', 'from'] },
      product,
      quantity(['quantityshipped', 'shippedqty']),
      location(['deliverto', 'arrivingat', 'destination', 'shipto']),
      { key: 'arrival', label: 'Expected arrival', type: 'date', required: true, aliases: ['arrival', 'arrivaldate', 'expectedarrival', 'expecteddate', 'expectedat', 'eta', 'deliverydate'] },
    ],
  },
}

export const importKindIds = Object.keys(importKinds) as ImportKind[]
