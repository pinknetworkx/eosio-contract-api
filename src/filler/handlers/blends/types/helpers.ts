export type Ingredient = {
    type: string,
    collection_name: string,
    schema_name: string,
    template_id: number,
    attributes: AttributeDefinition[],
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
