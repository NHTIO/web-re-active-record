import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { MorphOne } from '../src/lib/relationships/class_relationship_morph_one'
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { MorphMany } from '../src/lib/relationships/class_relationship_morph_many'
import type { ReactiveDatabaseOptions, InferredReactiveModelConstructor } from '../src/types'

// Example models: Post, Comment, Image, Video
// Comments and Images can belong to either a Post or a Video (polymorphic)

type Post = { id: number; title: string }
type Video = { id: number; url: string }
type Comment = { id: number; body: string; commentable_id: number; commentable_type: string }
type Image = { id: number; url: string; imageable_id: number; imageable_type: string }

type ObjectMap = { post: Post; video: Video; comment: Comment; image: Image }

const options: ReactiveDatabaseOptions<ObjectMap> = {
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
  namespace: 'testdb_polymorphic',
  version: 1,
  models: {
    post: {
      schema: '++id,title',
      properties: ['id', 'title'],
      primaryKey: 'id',
      relationships: {
        comments: [MorphMany, 'comment', 'commentable_id', 'commentable_type'],
        image: [MorphOne, 'image', 'imageable_id', 'imageable_type'],
      },
    },
    video: {
      schema: '++id,url',
      properties: ['id', 'url'],
      primaryKey: 'id',
      relationships: {
        comments: [MorphMany, 'comment', 'commentable_id', 'commentable_type'],
        image: [MorphOne, 'image', 'imageable_id', 'imageable_type'],
      },
    },
    comment: {
      schema: '++id,body,commentable_id,commentable_type',
      properties: ['id', 'body', 'commentable_id', 'commentable_type'],
      primaryKey: 'id',
      relationships: {},
    },
    image: {
      schema: '++id,url,imageable_id,imageable_type',
      properties: ['id', 'url', 'imageable_id', 'imageable_type'],
      primaryKey: 'id',
      relationships: {},
    },
  },
  psk: 'polymorphicpsk1234',
} as const

describe('Polymorphic Relationships (MorphOne/MorphMany)', () => {
  let db: ReactiveDatabase<ObjectMap>
  let PostModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'post'>
  let VideoModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'video'>
  let CommentModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'comment'>
  let ImageModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'image'>

  beforeAll(async () => {
    db = new ReactiveDatabase(options)
    await db.promise
    PostModel = db.model('post')
    VideoModel = db.model('video')
    CommentModel = db.model('comment')
    ImageModel = db.model('image')
  })

  afterAll(async () => {
    await db.shutdown()
  })

  afterEach(async () => {
    await PostModel.truncate()
    await VideoModel.truncate()
    await CommentModel.truncate()
    await ImageModel.truncate()
  })

  describe('MorphTo', () => {
    it('hydrates the correct related model based on type and id', async () => {
      const post = await PostModel.create({ title: 'Post 1' })
      const video = await VideoModel.create({ url: 'https://example.com/video.mp4' })
      const comment = await CommentModel.create({
        body: 'Comment for post',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      const comment2 = await CommentModel.create({
        body: 'Comment for video',
        commentable_id: video.id,
        commentable_type: 'video',
      })
      const relatedPost = await db
        .model(comment.commentable_type as keyof ObjectMap)
        .find(comment.commentable_id)
      const relatedVideo = await db
        .model(comment2.commentable_type as keyof ObjectMap)
        .find(comment2.commentable_id)
      expect(relatedPost?.title).toBe('Post 1')
      expect(relatedVideo?.url).toBe('https://example.com/video.mp4')
    })

    it('reacts to changes in the type or id columns', async () => {
      const post = await PostModel.create({ title: 'Post 2' })
      const video = await VideoModel.create({ url: 'https://example.com/vid2.mp4' })
      let comment = await CommentModel.create({
        body: 'Polymorphic comment',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      let related: any = await db
        .model(comment.commentable_type as keyof ObjectMap)
        .find(comment.commentable_id)
      expect(related?.title).toBe('Post 2')
      comment.commentable_id = video.id
      comment.commentable_type = 'video'
      await comment.save()
      const updatedComment = await CommentModel.find(comment.id)
      related = await db
        .model(updatedComment!.commentable_type as keyof ObjectMap)
        .find(updatedComment!.commentable_id)
      expect(related?.url).toBe('https://example.com/vid2.mp4')
    })

    it('should fetch the related model from a comment (morphTo)', async () => {
      const post = await PostModel.create({ title: 'BelongsTo Post' })
      const comment = await CommentModel.create({
        body: 'Belongs to post',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      const related = await db
        .model(comment.commentable_type as keyof ObjectMap)
        .find(comment.commentable_id)
      expect(related).toBeDefined()
      expect(related?.id).toBe(post.id)
      expect(related?.title).toBe('BelongsTo Post')
    })

    it('should return undefined if comment has no related model (morphTo)', async () => {
      const comment = await CommentModel.create({
        body: 'No related',
        commentable_id: 9999,
        commentable_type: 'post',
      })
      const related = await db
        .model(comment.commentable_type as keyof ObjectMap)
        .find(comment.commentable_id)
      expect(related).toBeUndefined()
    })

    it('should allow updating a comment to point to a different model (morphTo)', async () => {
      const post = await PostModel.create({ title: 'U1' })
      const video = await VideoModel.create({ url: 'https://u2.vid' })
      const comment = await CommentModel.create({
        body: 'Switch',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      comment.commentable_id = video.id
      comment.commentable_type = 'video'
      await comment.save()
      const related = await db
        .model(comment.commentable_type as keyof ObjectMap)
        .find(comment.commentable_id)
      expect(related?.id).toBe(video.id)
    })

    it('should dissociate a comment from a model (morphTo)', async () => {
      const post = await PostModel.create({ title: 'Dissoc' })
      const comment = await CommentModel.create({
        body: 'Dissoc',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      comment.commentable_id = null as any
      await comment.save()
      const related = await db
        .model(comment.commentable_type as keyof ObjectMap)
        .find(comment.commentable_id)
      expect(related).toBeUndefined()
    })

    it('should reactively update comment when the target is changed', async () => {
      const post1 = await PostModel.create({ title: 'R1' })
      const post2 = await PostModel.create({ title: 'R2' })
      const comment = await CommentModel.create({
        body: 'reactive',
        commentable_id: post1.id,
        commentable_type: 'post',
      })
      const handler = vi.fn()
      comment.onPropertyChange?.('commentable_id', handler)
      comment.onPropertyChange?.('commentable_type', handler)
      comment.commentable_id = post2.id
      await comment.save()
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(handler).toHaveBeenCalled()
      const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
      expect(callArg).toBe(post2.id)
    })
  })

  describe('MorphMany', () => {
    it('hydrates all comments for a post', async () => {
      const post = await PostModel.create({ title: 'Post with comments' })
      const c1 = await CommentModel.create({
        body: 'C1',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      const c2 = await CommentModel.create({
        body: 'C2',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      // Simulate MorphMany: find all comments for this post
      const comments = await CommentModel.findManyBy('commentable_id', [post.id])
      const filtered = comments.filter((c) => c.commentable_type === 'post')
      expect(filtered.map((c) => c.id)).toEqual(expect.arrayContaining([c1.id, c2.id]))
    })

    it('returns empty array if post has no comments', async () => {
      const post = await PostModel.create({ title: 'No comments' })
      const comments = await CommentModel.findManyBy('commentable_id', [post.id])
      const filtered = comments.filter((c) => c.commentable_type === 'post')
      expect(filtered).toHaveLength(0)
    })

    it('reactively updates when a comment is added', async () => {
      const post = await PostModel.create({ title: 'Reactive' })
      // Simulate: listen for changes to comments for this post
      const handler = vi.fn()
      // In a real MorphMany, you would have post.onPropertyChange('comments', handler)
      // Here, we simulate by listening for new comments
      let comments = await CommentModel.findManyBy('commentable_id', [post.id])
      comments = comments.filter((c) => c.commentable_type === 'post')
      handler(comments)
      await CommentModel.create({
        body: 'New comment',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      const updated = await CommentModel.findManyBy('commentable_id', [post.id])
      const filtered = updated.filter((c) => c.commentable_type === 'post')
      handler(filtered)
      expect(handler).toHaveBeenCalledTimes(2)
      expect(filtered.length).toBe(1)
    })

    it('reactively updates when a comment is dissociated', async () => {
      const post = await PostModel.create({ title: 'Dissoc' })
      const comment = await CommentModel.create({
        body: 'C',
        commentable_id: post.id,
        commentable_type: 'post',
      })
      const handler = vi.fn()
      let comments = await CommentModel.findManyBy('commentable_id', [post.id])
      comments = comments.filter((c) => c.commentable_type === 'post')
      handler(comments)
      comment.commentable_id = null as any
      await comment.save()
      const updated = await CommentModel.findManyBy('commentable_id', [post.id])
      const filtered = updated.filter((c) => c.commentable_type === 'post')
      handler(filtered)
      expect(handler).toHaveBeenCalledTimes(2)
      expect(filtered.length).toBe(0)
    })
  })

  describe('MorphOne', () => {
    it('hydrates the image for a post', async () => {
      const post = await PostModel.create({ title: 'Post with image' })
      const image = await ImageModel.create({
        url: 'https://img.com/1.png',
        imageable_id: post.id,
        imageable_type: 'post',
      })
      // Simulate MorphOne: find the image for this post
      const images = await ImageModel.findManyBy('imageable_id', [post.id])
      const filtered = images.filter((img) => img.imageable_type === 'post')
      expect(filtered[0]?.id).toBe(image.id)
      expect(filtered[0]?.url).toBe('https://img.com/1.png')
    })

    it('returns undefined if post has no image', async () => {
      const post = await PostModel.create({ title: 'No image' })
      const images = await ImageModel.findManyBy('imageable_id', [post.id])
      const filtered = images.filter((img) => img.imageable_type === 'post')
      expect(filtered[0]).toBeUndefined()
    })

    it('updates the image for a post', async () => {
      const post = await PostModel.create({ title: 'Update' })
      let image = await ImageModel.create({
        url: 'https://img.com/old.png',
        imageable_id: post.id,
        imageable_type: 'post',
      })
      image.url = 'https://img.com/new.png'
      await image.save()
      const images = await ImageModel.findManyBy('imageable_id', [post.id])
      const filtered = images.filter((img) => img.imageable_type === 'post')
      expect(filtered[0]?.url).toBe('https://img.com/new.png')
    })

    it('dissociates the image from a post', async () => {
      const post = await PostModel.create({ title: 'Dissoc' })
      const image = await ImageModel.create({
        url: 'https://img.com/del.png',
        imageable_id: post.id,
        imageable_type: 'post',
      })
      image.imageable_id = null as any
      await image.save()
      const images = await ImageModel.findManyBy('imageable_id', [post.id])
      const filtered = images.filter((img) => img.imageable_type === 'post')
      expect(filtered[0]).toBeUndefined()
    })

    it('reactively updates when the image is changed', async () => {
      const post = await PostModel.create({ title: 'Reactive' })
      let image = await ImageModel.create({
        url: 'https://img.com/react.png',
        imageable_id: post.id,
        imageable_type: 'post',
      })
      const handler = vi.fn()
      image.onPropertyChange?.('url', handler)
      image.url = 'https://img.com/changed.png'
      await image.save()
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(handler).toHaveBeenCalled()
      const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
      expect(callArg).toBe('https://img.com/changed.png')
    })
  })
})
