import * as express from 'express';

import { NeftyQuestNamespace} from '../index';
import { HTTPServer } from '../../../server';
import {
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters, primaryBoundaryParameters,
} from '../../../docs';
import {
    getLeaderboardAction,
    getLeaderboardCountAction, getQuestAction,
    getQuestsAction,
    getQuestsCountAction
} from '../handlers/quests';

export function questsEndpoints(core: NeftyQuestNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.all('/v1/quests', caching(), returnAsJSON(getQuestsAction, core));
    router.all('/v1/quests/_count', caching(), returnAsJSON(getQuestsCountAction, core));
    router.all('/v1/quests/:quest_id', caching(), returnAsJSON(getQuestAction, core));
    router.all('/v1/quests/:quest_id/leaderboard', caching(), returnAsJSON(getLeaderboardAction, core));
    router.all('/v1/quests/:quest_id/leaderboard/_count', caching(), returnAsJSON(getLeaderboardCountAction, core));

    return {
        tag: {
            name: 'neftyquest',
            description: 'NeftyQuest'
        },
        paths: {
            '/v1/quests': {
                get: {
                    tags: ['neftyquest'],
                    summary: 'Get the list of quests',
                    description:
                        'Get the list of quests',
                    parameters: [
                        ...primaryBoundaryParameters,
                        ...dateBoundaryParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'quest_id', 'start_time', 'end_time',
                                ],
                                default: 'start_time'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/QuestItem'}
                    })
                }
            },
            '/v1/quests/{quest_id}': {
                get: {
                    tags: ['neftyquest'],
                    summary: 'Get a quests',
                    description:
                        'Get a specific quest',
                    parameters: [
                        {
                            name: 'quest_id',
                            in: 'path',
                            description: 'Quest id',
                            required: true,
                            schema: {type: 'string'}
                        },
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        items: {'$ref': '#/components/schemas/QuestItem'}
                    })
                }
            },
            '/v1/quests/{quest_id}/leaderboard': {
                get: {
                    tags: ['neftyquest'],
                    summary: 'Get leaderboard for a quest',
                    description:
                        'Que all the entries in for a quest leaderboard',
                    parameters: [
                        {
                            name: 'quest_id',
                            in: 'path',
                            description: 'Quest id',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'account_name',
                            in: 'query',
                            description: 'Account name to filter',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'rank', 'experience', 'account',
                                ],
                                default: 'rank'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/LeaderboardItem'}
                    })
                }
            },
        }
    };
}
