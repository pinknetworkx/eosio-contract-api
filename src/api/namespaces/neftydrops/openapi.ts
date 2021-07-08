export const neftyDropsComponents = {
  Drop: {

  },
  Claim: {

  }
};

export const dropDataFilter =
    'You can filter the result by specific template data fields.' +
    'You can add for example &template_data.rarity=common to only receive results which have an attribute "rarity" with the value "common". ' +
    'You can query specific asset data by using &immutable_data.rarity=common or &mutable_data.rarity=common .' +
    'If you want to query a non text type you need to specify it explicitly (defaults to text type) like data:bool.foil=true or data:number.id=4 or data:text.rarity=common. ' +
    'Integers which are defined greater than 32 bit (eg 64 bit) in the schema need to be queried as text.';

export const dropsFilterParameters = [
  {
    name: 'min_assets',
    in: 'query',
    description: 'Min assets per drop',
    required: false,
    schema: {type: 'integer'}
  },
  {
    name: 'max_assets',
    in: 'query',
    description: 'Max assets per drop',
    required: false,
    schema: {type: 'integer'}
  },
  {
    name: 'template_id',
    in: 'query',
    description: 'Template id in the drop',
    required: false,
    schema: {type: 'int'}
  },
  {
    name: 'symbol',
    in: 'query',
    description: 'Filter by symbol',
    required: false,
    schema: {type: 'string'}
  },
  {
    name: 'min_price',
    in: 'query',
    description: 'Lower price limit',
    required: false,
    schema: {type: 'number'}
  },
  {
    name: 'max_price',
    in: 'query',
    description: 'Upper price limit',
    required: false,
    schema: {type: 'number'}
  }
];
