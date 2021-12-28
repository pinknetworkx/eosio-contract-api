export type LogNewBlendAction = {
    blend_id: number,
    collection_name: string,
    max_uses: number,
    ingredients: any[],
    rolls: any,
    start_time: number,
    end_time: number,
    display_data: string,
    security_id: string,
};

export type DeleteBlendAction = {
    authorized_account: string,
    blend_id: number,
};

export type SetBlendDataAction = {
    authorized_account: string,
    blend_id: number,
    display_data: string,
};

export type SetBlendMaxAction = {
    authorized_account: string,
    blend_id: number,
    display_data: string,
};

export type SetBlendSecurityAction = {
    authorized_account: string,
    blend_id: number,
    security_id: string,
};

export type SetBlendTimeAction = {
    authorized_account: string,
    blend_id: number,
    start_time: string,
    end_time: string,
};

