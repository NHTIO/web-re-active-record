import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { HasOne, BelongsTo } from '@nhtio/web-re-active-record/relationships'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type {
  ReactiveDatabaseOptions,
  InferredReactiveModelConstructor,
} from '@nhtio/web-re-active-record/types'

type User = { id: number; name: string }
type Profile = { id: number; userId: number; bio?: string }

type ObjectMap = {
  user: User
  profile: Profile
}

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
  namespace: 'testdb_rel_one_to_one',
  version: 1,
  models: {
    user: {
      schema: '++id,name',
      properties: ['id', 'name'],
      primaryKey: 'id',
      relationships: {
        profile: [HasOne, 'profile', 'userId'],
      },
    },
    profile: {
      schema: '++id,userId',
      properties: ['id', 'userId', 'bio'],
      primaryKey: 'id',
      relationships: {
        user: [BelongsTo, 'user', 'userId'],
      },
    },
  },
  psk: '1234567890abcdef',
} as const

describe('One-to-One Relationships (HasOne/BelongsTo)', () => {
  let db: ReactiveDatabase<ObjectMap>
  let UserModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'user'>
  let ProfileModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'profile'>

  beforeAll(async () => {
    db = new ReactiveDatabase<ObjectMap>(options)
    await db.promise
    UserModel = db.model('user')
    ProfileModel = db.model('profile')
  })

  afterAll(async () => {
    await db.shutdown()
  })

  afterEach(async () => {
    await UserModel.truncate()
    await ProfileModel.truncate()
  })

  it('should create a user and a profile and link them (hasOne)', async () => {
    const user = await UserModel.create({ name: 'Alice' })
    await ProfileModel.create({ userId: user.id, bio: 'Hello!' })
    // Correct way to access related profile
    const relatedProfile = await user.related('profile')
    expect(relatedProfile).toBeDefined()
    expect(relatedProfile.userId).toBe(user.id)
    expect(relatedProfile.bio).toBe('Hello!')
    // Check the .profile accessor after loading
    await user.load('profile')
    expect(user.profile).toBeDefined()
    expect(user.profile.userId).toBe(user.id)
    expect(user.profile.bio).toBe('Hello!')
  })

  it('should fetch the user from a profile (belongsTo)', async () => {
    const user = await UserModel.create({ name: 'Bob' })
    const profile = await ProfileModel.create({ userId: user.id, bio: 'Bio for Bob' })
    // Correct way to access related user
    const relatedUser = await profile.related('user')
    expect(relatedUser).toBeDefined()
    expect(relatedUser.id).toBe(user.id)
    expect(relatedUser.name).toBe('Bob')
    // Check the .user accessor after loading
    await profile.load('user')
    expect(profile.user).toBeDefined()
    expect(profile.user.id).toBe(user.id)
    expect(profile.user.name).toBe('Bob')
  })

  // --- HasOne (User -> Profile) ---

  it('should return null if user has no profile (hasOne)', async () => {
    const user = await UserModel.create({ name: 'NoProfile' })
    const relatedProfile = await user.related('profile')
    expect(relatedProfile).toBeUndefined()
    // Check the .profile accessor after loading
    await user.load('profile')
    expect(user.profile).toBeUndefined()
  })

  it('should allow updating a profile to a different user (hasOne)', async () => {
    const user1 = await UserModel.create({ name: 'U1' })
    const user2 = await UserModel.create({ name: 'U2' })
    // Prepare reactivity
    await user1.load('profile')
    await user2.load('profile')
    expect(user1.profile).toBeUndefined()
    expect(user2.profile).toBeUndefined()
    // Create profile for user1
    const profile = await ProfileModel.create({ userId: user1.id, bio: 'bio' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(user1.profile).toBeDefined()
    expect(user1.profile.id).toBe(profile.id)
    expect(user1.profile.bio).toBe('bio')
    expect(user2.profile).toBeUndefined()
    // Move profile to user2
    profile.userId = user2.id
    await profile.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(user1.profile).toBeUndefined()
    expect(user2.profile).toBeDefined()
    expect(user2.profile.id).toBe(profile.id)
    expect(user2.profile.bio).toBe('bio')
  })

  it('should dissociate a profile from a user (hasOne)', async () => {
    const user = await UserModel.create({ name: 'Dissoc' })
    await user.load('profile')
    expect(user.profile).toBeUndefined()
    const profile = await ProfileModel.create({ userId: user.id, bio: 'bio' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(user.profile).toBeDefined()
    expect(user.profile.id).toBe(profile.id)
    // Dissociate
    profile.userId = null as any
    await profile.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(user.profile).toBeUndefined()
    const relatedProfile = await user.related('profile')
    expect(relatedProfile).toBeUndefined()
  })

  // --- BelongsTo (Profile -> User) ---

  it('should return undefined if profile has no user (belongsTo)', async () => {
    const profile = await ProfileModel.create({ userId: null as any, bio: 'no user' })
    const relatedUser = await profile.related('user')
    expect(relatedUser).toBeUndefined()
    // Check the .user accessor after loading
    await profile.load('user')
    expect(profile.user).toBeUndefined()
  })

  it('should allow updating a profile to point to a different user (belongsTo)', async () => {
    const user1 = await UserModel.create({ name: 'U1' })
    const user2 = await UserModel.create({ name: 'U2' })
    const profile = await ProfileModel.create({ userId: user1.id, bio: 'bio' })
    profile.userId = user2.id
    await profile.save()
    const relatedUser = await profile.related('user')
    expect(relatedUser.id).toBe(user2.id)
  })

  it('should dissociate a profile from a user (belongsTo)', async () => {
    const user = await UserModel.create({ name: 'DissocBelongs' })
    const profile = await ProfileModel.create({ userId: user.id, bio: 'bio' })
    // Check before dissociation
    await profile.load('user')
    expect(profile.user).toBeDefined()
    expect(profile.user.id).toBe(user.id)
    // Dissociate
    profile.userId = null as any
    await profile.save()
    // Ensure relationship is refreshed
    await profile.load('user')
    const relatedUser = await profile.related('user')
    expect(relatedUser).toBeUndefined()
    expect(profile.user).toBeUndefined()
  })

  // --- Reactivity Tests (using Vitest mocks, with explicit relationship preparation using load) ---

  it('should reactively update user.profile when a profile is created for the user', async () => {
    const user = await UserModel.create({ name: 'ReactiveUser' })
    await user.load('profile') // Ensure relationship is prepared
    const handler = vi.fn()
    user.onPropertyChange('profile', handler)
    expect(await user.related('profile')).toBeUndefined()
    // Create profile for user
    const profile = await ProfileModel.create({ userId: user.id, bio: 'Reactive bio' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(callArg).toBeDefined()
    expect(callArg.id).toBe(profile.id)
    expect(callArg.userId).toBe(user.id)
  })

  it('should reactively update user.profile when the profile is dissociated', async () => {
    const user = await UserModel.create({ name: 'ReactiveDissoc' })
    const profile = await ProfileModel.create({ userId: user.id, bio: 'bio' })
    await user.load('profile') // Ensure relationship is prepared
    const handler = vi.fn()
    user.onPropertyChange('profile', handler)
    profile.userId = null as any
    await profile.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(callArg).toBeUndefined()
  })

  it('should reactively update profile.user when the user is changed', async () => {
    const user1 = await UserModel.create({ name: 'U1' })
    const user2 = await UserModel.create({ name: 'U2' })
    const profile = await ProfileModel.create({ userId: user1.id, bio: 'bio' })
    await profile.load('user') // Ensure relationship is prepared
    const handler = vi.fn()
    profile.onPropertyChange('user', handler)
    profile.userId = user2.id
    await profile.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(callArg).toBeDefined()
    expect(callArg.id).toBe(user2.id)
  })

  it('should reactively update profile.user when the user is dissociated', async () => {
    const user = await UserModel.create({ name: 'ReactiveBelongsDissoc' })
    const profile = await ProfileModel.create({ userId: user.id, bio: 'bio' })
    await profile.load('user') // Ensure relationship is prepared
    const handler = vi.fn()
    profile.onPropertyChange('user', handler)
    profile.userId = null as any
    await profile.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(callArg).toBeUndefined()
  })
})
