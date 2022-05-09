export type Ingredient = {
    balance_ingredient_attribute_name: string,
    balance_ingredient_cost: number,
    type: string,
    collection_name: string,
    schema_name: string,
    template_id: number,
    attributes: AttributeDefinition[],
    typed_attributes: TypedAttributeDefinition[],
    display_data: string,
    amount: number,
    effect: Effect,
    index: number,
};

export type Effect = {
    type: string,
    payload: any,
};

export type AttributeDefinition = {
    attribute_name: string,
    allowed_values: string[],
};

export type TypedAttributeDefinition = {
    attribute_name: string,
    attribute_type: string,
    // variant
    allowed_values: any[],
};
