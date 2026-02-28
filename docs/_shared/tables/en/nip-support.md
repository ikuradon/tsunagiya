| NIP    | Description                           | Support Status                                                                     |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------- |
| NIP-01 | Basic Protocol                        | EVENT, REQ, CLOSE, EOSE, OK, CLOSED, NOTICE + Event Treatment + Addressable Events |
| NIP-04 | Encrypted DM ⚠️ deprecated (→ NIP-17) | EventBuilder template (migration to NIP-17 recommended)                            |
| NIP-09 | Event Deletion                        | kind:5 deletion request handling                                                   |
| NIP-10 | Reply Threading                       | EventBuilder e/p tags                                                              |
| NIP-11 | Relay Information                     | setInfo/getInfo + fetch interception                                               |
| NIP-17 | Private Direct Messages               | EventBuilder templates (chatMessage/seal/giftWrap/dmRelayList)                     |
| NIP-18 | Reposts                               | EventBuilder templates (repost/genericRepost)                                      |
| NIP-23 | Long-form Content                     | EventBuilder templates (longFormContent/longFormDraft)                             |
| NIP-25 | Reactions                             | EventBuilder withReactions / externalReaction                                      |
| NIP-29 | Relay-based Groups                    | EventBuilder templates                                                             |
| NIP-30 | Custom Emoji                          | EventBuilder emoji tag                                                             |
| NIP-40 | Expiration Timestamp                  | EventBuilder `withExpiration()`                                                    |
| NIP-42 | AUTH                                  | Challenge/response                                                                 |
| NIP-45 | COUNT                                 | COUNT message support                                                              |
| NIP-50 | Search                                | Content partial-match search                                                       |
| NIP-51 | Lists                                 | EventBuilder templates (muteList/pinList/bookmarks/followSet, etc.)                |
| NIP-52 | Calendar Events                       | EventBuilder templates (all 4 types: Date/Time/Collection/RSVP)                    |
| NIP-57 | Lightning Zaps                        | EventBuilder templates                                                             |
| NIP-65 | Relay List Metadata                   | EventBuilder relayList (kind:10002)                                                |

> **Note:** The former NIP-16 (Event Treatment) and NIP-33 (Parameterized
> Replaceable Events) have been merged into NIP-01.
> Regular/Replaceable/Ephemeral/Addressable event handling in this library is
> part of NIP-01 support.
