import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { HasMany, HasManyThrough, BelongsTo } from '@nhtio/web-re-active-record/relationships'
import type {
  ReactiveDatabaseOptions,
  InferredReactiveModelConstructor,
} from '@nhtio/web-re-active-record/types'

type User = { id: number; name: string }
type Post = { id: number; userId: number; title: string }
type Comment = { id: number; postId: number; userId: number; body: string }
type ObjectMap = { user: User; post: Post; comment: Comment }

// ObjectMap for HasMany and HasManyThrough
const options: ReactiveDatabaseOptions<{
  user: User
  post: Post
  comment: Comment
}> = {
  initial: {
    loggers: {
      emerg: [],
      alert: [],
      crit: [],
      error: [],
      warning: [],
      notice: [],
      info: [],
      debug: [],
    },
    subscriptions: [],
  },
  namespace: 'testdb_rel_one_to_many',
  version: 1,
  models: {
    user: {
      schema: '++id,name',
      properties: ['id', 'name'],
      primaryKey: 'id',
      relationships: {
        posts: [HasMany, 'post', 'userId'],
        comments: [
          HasManyThrough,
          'comment',
          [
            [HasMany, 'post', 'userId'],
            [HasMany, 'comment', 'postId'],
          ],
        ],
      },
    },
    post: {
      schema: '++id,userId,title',
      properties: ['id', 'userId', 'title'],
      primaryKey: 'id',
      relationships: {
        user: [BelongsTo, 'user', 'userId'],
        comments: [HasMany, 'comment', 'postId'],
      },
    },
    comment: {
      schema: '++id,postId,userId,body',
      properties: ['id', 'postId', 'userId', 'body'],
      primaryKey: 'id',
      relationships: {
        post: [BelongsTo, 'post', 'postId'],
        user: [BelongsTo, 'user', 'userId'],
      },
    },
  },
  psk: '1234567890abcdef',
} as const

describe('One-to-Many Relationships (HasMany/HasManyThrough)', () => {
  let db: ReactiveDatabase<ObjectMap>
  let UserModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'user'>
  let PostModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'post'>
  let CommentModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'comment'>

  beforeAll(async () => {
    db = new ReactiveDatabase(options)
    await db.promise
    UserModel = db.model('user')
    PostModel = db.model('post')
    CommentModel = db.model('comment')
  })

  afterAll(async () => {
    await db.shutdown()
  })

  afterEach(async () => {
    await UserModel.truncate()
    await PostModel.truncate()
    await CommentModel.truncate()
  })

  it('should create a user and posts and link them (hasMany)', async () => {
    const user = await UserModel.create({ name: 'Alice' })
    await PostModel.create({ userId: user.id, title: 'Post 1' })
    await PostModel.create({ userId: user.id, title: 'Post 2' })
    const posts = await user.related('posts')
    expect(posts).toHaveLength(2)
    expect(posts[0].userId).toBe(user.id)
    expect(posts[1].userId).toBe(user.id)
  })

  it('should fetch the user from a post (belongsTo)', async () => {
    const user = await UserModel.create({ name: 'Bob' })
    const post = await PostModel.create({ userId: user.id, title: "Bob's Post" })
    const relatedUser = await post.related('user')
    expect(relatedUser).toBeDefined()
    expect(relatedUser.id).toBe(user.id)
    expect(relatedUser.name).toBe('Bob')
  })

  it('should return empty array if user has no posts (hasMany)', async () => {
    const user = await UserModel.create({ name: 'NoPosts' })
    const posts = await user.related('posts')
    expect(posts).toHaveLength(0)
  })

  it('should allow updating a post to a different user (hasMany)', async () => {
    const user1 = await UserModel.create({ name: 'U1' })
    const user2 = await UserModel.create({ name: 'U2' })
    const post = await PostModel.create({ userId: user1.id, title: 'P' })
    post.userId = user2.id
    await post.save()
    const posts1 = await user1.related('posts')
    const posts2 = await user2.related('posts')
    expect(posts1).toHaveLength(0)
    expect(posts2).toHaveLength(1)
    expect(posts2[0].id).toBe(post.id)
  })

  it('should dissociate a post from a user (hasMany)', async () => {
    const user = await UserModel.create({ name: 'Dissoc' })
    const post = await PostModel.create({ userId: user.id, title: 'Dissoc Post' })
    post.userId = null as any
    await post.save()
    const posts = await user.related('posts')
    expect(posts).toHaveLength(0)
  })

  it('should support HasManyThrough: user.comments via posts', async () => {
    const user = await UserModel.create({ name: 'ThroughUser' })
    const post1 = await PostModel.create({ userId: user.id, title: 'P1' })
    const post2 = await PostModel.create({ userId: user.id, title: 'P2' })
    await CommentModel.create({ postId: post1.id, userId: user.id, body: 'C1' })
    await CommentModel.create({ postId: post2.id, userId: user.id, body: 'C2' })
    const comments = await user.related('comments')
    expect(comments).toHaveLength(2)
    expect(comments[0].postId).toBe(post1.id)
    expect(comments[1].postId).toBe(post2.id)
  })

  // --- Reactivity Tests (using Vitest mocks, with explicit relationship preparation using load) ---

  it('should reactively update user.posts when a post is created for the user', async () => {
    const user = await UserModel.create({ name: 'ReactiveUser' })
    await user.load('posts')
    const handler = vi.fn()
    user.onPropertyChange('posts', handler)
    expect(await user.related('posts')).toHaveLength(0)
    await PostModel.create({ userId: user.id, title: 'Reactive Post' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(Array.isArray(callArg)).toBe(true)
    expect(callArg.length).toBe(1)
    expect(callArg[0].title).toBe('Reactive Post')
  })

  it('should reactively update user.posts when a post is dissociated', async () => {
    const user = await UserModel.create({ name: 'ReactiveDissoc' })
    const post = await PostModel.create({ userId: user.id, title: 'Dissoc Post' })
    await user.load('posts')
    const handler = vi.fn()
    user.onPropertyChange('posts', handler)
    post.userId = null as any
    await post.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(Array.isArray(callArg)).toBe(true)
    expect(callArg.length).toBe(0)
  })

  it("should reactively update user.comments (HasManyThrough) when a comment is created for a user's post", async () => {
    const user = await UserModel.create({ name: 'ReactiveThrough' })
    const post = await PostModel.create({ userId: user.id, title: 'P' })
    await user.load('comments')
    const handler = vi.fn()
    user.onPropertyChange('comments', handler)
    expect(await user.related('comments')).toHaveLength(0)
    await CommentModel.create({ postId: post.id, userId: user.id, body: 'C' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(Array.isArray(callArg)).toBe(true)
    expect(callArg.length).toBe(1)
    expect(callArg[0].body).toBe('C')
  })

  it('should reactively update user.comments (HasManyThrough) when a post is dissociated', async () => {
    const user = await UserModel.create({ name: 'ReactiveThroughDissoc' })
    const post = await PostModel.create({ userId: user.id, title: 'P' })
    await CommentModel.create({ postId: post.id, userId: user.id, body: 'C' })
    await user.load('comments')
    const handler = vi.fn()
    user.onPropertyChange('comments', handler)
    // Dissociate the post (should remove the comment from user.comments)
    post.userId = null as any
    await post.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(Array.isArray(callArg)).toBe(true)
    expect(callArg.length).toBe(0)
  })

  it('should reactively update user.comments (HasManyThrough) when a comment is dissociated', async () => {
    const user = await UserModel.create({ name: 'ReactiveThroughCommentDissoc' })
    const post = await PostModel.create({ userId: user.id, title: 'P' })
    const comment = await CommentModel.create({ postId: post.id, userId: user.id, body: 'C' })
    await user.load('comments')
    const handler = vi.fn()
    user.onPropertyChange('comments', handler)
    // Dissociate the comment (should remove it from user.comments)
    comment.postId = null as any
    await comment.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(Array.isArray(callArg)).toBe(true)
    expect(callArg.length).toBe(0)
  })
})
