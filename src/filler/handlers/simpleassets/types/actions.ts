export type CreateLogActionData = {
    author: string;
    category: string;
    owner: string;
    idata: string;
    mdata: string;
    asseetid: string;
    requireclaim: boolean;
}

export type ClaimActionData = {
    claimer: string;
    assetids: string[];
}

export type TransferActionData = {
    from: string;
    to: string;
    assetids: string[];
    memo: string;
}

export type UpdateActionData = {
    author: string;
    owner: string;
    assetid: string;
    mdata: string;
}

export type BurnLogActionData = {
    owner: string;
    assetids: string[];
    memo: string;
}

export type ChangeAuthorActionData = {
    author: string;
    newauthor: string;
    owner: string;
    assetids: string[];
    memo: string;
}
