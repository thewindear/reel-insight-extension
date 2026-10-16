import assert from 'node:assert/strict';
import { captionEntities } from '../src/reel/caption.ts';
import { findProfile, findReels, mergeProfiles, mergeReels, profileFrom, profileFromPageEvent, reelFromPageEvent } from '../src/reel/extract.ts';

const payload = { data: { reels_media: [{
  code: 'ABC123', pk: 456, is_video: true, taken_at: 1792063053,
  owner: { pk: 123, username: 'creator', full_name: 'Creator Name', profile_pic_url: 'https://example.com/avatar.jpg', is_verified: true },
  coauthor_producers: [{ pk: 789, username: 'partner', full_name: 'Partner' }],
  usertags: { in: [
    { user: { pk: 246, username: 'tagged.one', full_name: 'Tagged One', profile_pic_url: 'https://example.com/tagged.jpg' } },
    { user: { pk: 247, username: 'tagged.two' } },
    { user: { pk: 246, username: 'tagged.one' } },
  ] },
  caption: { text: 'Watch #旅行 #旅行 with @partner at https://example.com/a?x=1.' },
  video_versions: [{ url: 'https://example.com/reel.mp4' }],
  image_versions2: { candidates: [{ url: 'https://example.com/cover.jpg' }] },
  play_count: 0, like_count: 321, comment_count: 12, share_count: 7, reshare_count: 3,
}] } };

const [reel] = findReels(payload);
assert.equal(reel.mediaId, '456');
assert.equal(reel.publishedAt, '2026-10-15T11:17:33.000Z');
assert.equal(reel.authors[0].id, '123');
assert.deepEqual(reel.authors.map(author => author.username), ['creator', 'partner']);
assert.deepEqual(reel.taggedUsers.map(user => user.username), ['tagged.one', 'tagged.two']);
assert.equal(reel.taggedUsers[0].id, '246');
assert.equal(reel.taggedUsers[0].avatar, 'https://example.com/tagged.jpg');
assert.equal(reel.plays, 0);
assert.equal(Object.hasOwn(reel, 'shares'), false);
assert.equal(reel.reposts, 3);
assert.equal(reel.videoUrl, 'https://example.com/reel.mp4');
assert.equal(reel.coverUrl, 'https://example.com/cover.jpg');
assert.deepEqual(captionEntities(reel.caption), {
  tags: ['旅行'], mentions: ['partner'], links: ['https://example.com/a?x=1'],
});
assert.deepEqual(captionEntities('http://example.com #tag'), {
  tags: ['tag'], mentions: [], links: ['http://example.com'],
});
assert.equal(mergeReels(reel, { ...reel, authors: [{ ...reel.authors[0], id: null }], likes: null }).authors[0].id, '123');
assert.deepEqual(mergeReels(reel, { ...reel, taggedUsers: [] }).taggedUsers.map(user => user.username), ['tagged.one', 'tagged.two']);
assert.equal(mergeReels(reel, { ...reel, taggedUsers: [{ ...reel.taggedUsers[0], id: null }] }).taggedUsers[0].id, '246');
assert.equal(mergeReels(reel, { ...reel, likes: null }).likes, 321);
assert.equal(mergeReels(reel, { ...reel, reposts: null }).reposts, 3);
assert.equal(reelFromPageEvent(reel).authors[0].id, '123');
assert.equal(reelFromPageEvent(reel).publishedAt, reel.publishedAt);
assert.deepEqual(reelFromPageEvent(reel).taggedUsers.map(user => user.username), ['tagged.one', 'tagged.two']);
assert.equal(reelFromPageEvent(reel).reposts, 3);
assert.equal(mergeReels(reel, { ...reel, publishedAt: null }).publishedAt, reel.publishedAt);
assert.equal(findReels({ code: 'GRAPH_TIME', owner: { username: 'creator' }, taken_at_timestamp: '1792063053' })[0].publishedAt, reel.publishedAt);
assert.equal(findReels({ code: 'BAD_TIME', owner: { username: 'creator' }, taken_at: 'unknown' })[0].publishedAt, null);
assert.equal(reelFromPageEvent({ ...reel, publishedAt: 'tomorrow' }).publishedAt, null);
const [repostOnly] = findReels({ code: 'ONLY_REPOST', owner: { username: 'creator' }, reshare_count: 0 });
assert.equal(Object.hasOwn(repostOnly, 'shares'), false);
assert.equal(repostOnly.reposts, 0);
const [newCounts] = findReels({ code: 'NEW_COUNTS', owner: { username: 'creator' }, content_views_count: 120, repost_count: 4, reshare_count: 9 });
assert.equal(newCounts.plays, 120);
assert.equal(newCounts.reposts, 4);
const [graphTagged] = findReels({ code: 'GRAPH_TAGS', owner: { username: 'creator' },
  edge_media_to_tagged_user: { edges: [{ node: { user: { id: '991', username: 'graph.tag' } } }] },
});
assert.deepEqual(graphTagged.taggedUsers.map(user => user.username), ['graph.tag']);
assert.equal(graphTagged.taggedUsers[0].id, '991');
const [flatTagged] = findReels({ code: 'FLAT_TAGS', owner: { username: 'creator' },
  tagged_users: [{ user: { username: 'flat.tag' } }],
});
assert.deepEqual(flatTagged.taggedUsers.map(user => user.username), ['flat.tag']);
assert.equal(reelFromPageEvent({ ...reel, code: '<script>' }), null);
assert.equal(Object.hasOwn(reelFromPageEvent({ ...reel, shares: 7 }), 'shares'), false);
const profile = findProfile({ data: { user: { pk: '12', username: 'creator', full_name: 'Creator',
  profile_pic_url: 'https://example.com/avatar.jpg', biography: 'Hello',
  bio_links: [{ url: 'https://example.com/home' }, { url: 'javascript:alert(1)' }],
  follower_count: 0, following_count: 8, media_count: 3, is_verified: false,
  about_this_account: { date_joined: 'October 2020', account_based_in: 'United States', date_verified: 'June 2022' },
} } }, 'creator');
assert.equal(profile.id, '12');
assert.equal(profile.followers, 0);
assert.deepEqual(profile.bioLinks, ['https://example.com/home']);
assert.equal(profile.joinedAt, 'October 2020');
assert.equal(profile.basedIn, 'United States');
assert.equal(profile.verifiedAt, 'June 2022');
assert.equal(findProfile({ user: { username: 'other', follower_count: 9 } }, 'creator'), null);
assert.equal(profileFromPageEvent({ ...profile, username: '<script>', bioLinks: ['https://example.com'] }), null);
assert.deepEqual(profileFromPageEvent(profile).bioLinks, ['https://example.com/home']);
assert.deepEqual(mergeProfiles(profile, { ...profile, name: null, bioLinks: ['https://example.com/second'] }).bioLinks,
  ['https://example.com/second'], '重新采集到完整链接列表时替换旧链接');
assert.deepEqual(mergeProfiles(profile, profileFrom({ username: 'creator', bio_links: [] })).bioLinks,
  [], '当前账号已删除所有 bio 链接时清空旧链接');
assert.deepEqual(mergeProfiles(profile, profileFrom({ username: 'creator' })).bioLinks,
  ['https://example.com/home'], '精简响应未提供链接列表时保留已采集的链接');
assert.equal(profileFromPageEvent(profileFrom({ username: 'creator' })).bioLinksComplete, false,
  '跨世界重建时不能把缺失的链接字段误判为完整空列表');
console.log('Reel extraction checks passed');
