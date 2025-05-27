import { describe, it, expect, vi } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { ManyToMany } from '../src/lib/relationships/class_relationship_many_to_many'
import type { InferredReactiveModelConstructor, ReactiveDatabaseOptions } from '../src/types'

interface ObjectMap {
  users: { id: number; email: string }
  skills: { id: number; name: string }
  skills_users: { id: number; user_id: number; skill_id: number }
  [key: string]: Record<string, unknown>
}

const dbOptions: ReactiveDatabaseOptions<ObjectMap> = {
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
  namespace: 'testdb',
  version: 1,
  models: {
    users: {
      schema: '++id, email',
      properties: ['id', 'email'],
      primaryKey: 'id',
      relationships: {
        skills: [ManyToMany, 'skills', 'skills_users', 'user_id', 'skill_id'],
      },
    },
    skills: {
      schema: '++id, name',
      properties: ['id', 'name'],
      primaryKey: 'id',
      relationships: {
        users: [ManyToMany, 'users', 'skills_users', 'skill_id', 'user_id'],
      },
    },
    skills_users: {
      schema: '++id, user_id, skill_id',
      properties: ['id', 'user_id', 'skill_id'],
      primaryKey: 'id',
      relationships: {},
    },
  },
  psk: 'testtesttesttest',
}

type UserModel = InstanceType<
  InferredReactiveModelConstructor<ObjectMap, typeof dbOptions, 'users'>
>
type SkillModel = InstanceType<
  InferredReactiveModelConstructor<ObjectMap, typeof dbOptions, 'skills'>
>

// Define the object map and options type for the test database
describe('ManyToMany relationship', () => {
  const db = new ReactiveDatabase(dbOptions)

  it('should associate users and skills via the join table', async () => {
    const user = await db.model('users').create({ email: 'alice@example.com' })
    const skill = await db.model('skills').create({ name: 'TypeScript' })
    await db.model('skills_users').create({ user_id: user.id, skill_id: skill.id })

    const userWithSkills = (await db.model('users').find(user.id)) as UserModel | undefined
    if (userWithSkills) {
      await userWithSkills.load('skills')
      // Check the accessor directly
      expect(userWithSkills.skills).toBeDefined()
      expect(Array.isArray(userWithSkills.skills)).toBe(true)
      expect(userWithSkills.skills).toHaveLength(1)
      expect(userWithSkills.skills[0].name).toBe('TypeScript')
    }
    const skillWithUsers = (await db.model('skills').find(skill.id)) as SkillModel | undefined
    if (skillWithUsers) {
      await skillWithUsers.load('users')
      // Check the accessor directly
      expect(skillWithUsers.users).toBeDefined()
      expect(Array.isArray(skillWithUsers.users)).toBe(true)
      expect(skillWithUsers.users).toHaveLength(1)
      expect(skillWithUsers.users[0].email).toBe('alice@example.com')
    }
  })

  it('should return an empty array if no associations exist', async () => {
    const user = await db.model('users').create({ email: 'bob@example.com' })
    const userWithSkills = (await db.model('users').find(user.id)) as UserModel | undefined
    if (userWithSkills) {
      await userWithSkills.load('skills')
      // Check the accessor directly
      expect(userWithSkills.skills).toBeDefined()
      expect(Array.isArray(userWithSkills.skills)).toBe(true)
      expect(userWithSkills.skills).toEqual([])
    }
  })

  it('should update relationships reactively when join table changes', async () => {
    const user = await db.model('users').create({ email: 'carol@example.com' })
    const skill = await db.model('skills').create({ name: 'React' })
    const userWithSkills = (await db.model('users').find(user.id)) as UserModel | undefined
    if (userWithSkills) {
      await userWithSkills.load('skills')
      expect(userWithSkills.skills).toBeDefined()
      expect(Array.isArray(userWithSkills.skills)).toBe(true)
      expect(userWithSkills.skills).toEqual([])

      // Listen for property change
      const handler = vi.fn()
      userWithSkills.onPropertyChange('skills', handler)

      await db.model('skills_users').create({ user_id: user.id, skill_id: skill.id })
      // Wait for reactivity
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(handler).toHaveBeenCalled()
      expect(userWithSkills.skills).toBeDefined()
      expect(Array.isArray(userWithSkills.skills)).toBe(true)
      expect(userWithSkills.skills).toHaveLength(1)
      expect(userWithSkills.skills[0].name).toBe('React')

      // Remove association
      const join = await db
        .model('skills_users')
        .query()
        .where({ user_id: user.id, skill_id: skill.id })
        .first()
      if (join) await join.delete()
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(userWithSkills.skills).toBeDefined()
      expect(Array.isArray(userWithSkills.skills)).toBe(true)
      expect(userWithSkills.skills).toEqual([])
    }
  })

  it('should allow multiple associations for both sides', async () => {
    const user1 = await db.model('users').create({ email: 'dave@example.com' })
    const user2 = await db.model('users').create({ email: 'eve@example.com' })
    const skill1 = await db.model('skills').create({ name: 'Vue' })
    const skill2 = await db.model('skills').create({ name: 'Svelte' })
    await db.model('skills_users').create({ user_id: user1.id, skill_id: skill1.id })
    await db.model('skills_users').create({ user_id: user1.id, skill_id: skill2.id })
    await db.model('skills_users').create({ user_id: user2.id, skill_id: skill1.id })
    const user1WithSkills = (await db.model('users').find(user1.id)) as UserModel | undefined
    if (user1WithSkills) {
      await user1WithSkills.load('skills')
      expect(user1WithSkills.skills.map((s: { name: string }) => s.name).sort()).toEqual([
        'Svelte',
        'Vue',
      ])
    }
    // Use the original skill1 instance and check reactivity
    await skill1.load('users')
    expect((skill1.users as UserModel[]).map((u) => u.email).sort()).toEqual([
      'dave@example.com',
      'eve@example.com',
    ])
  })

  it('should fetch the user from a skill (bidirectional)', async () => {
    const user = await db.model('users').create({ email: 'bob@example.com' })
    const skill = await db.model('skills').create({ name: 'Python' })
    await db.model('skills_users').create({ user_id: user.id, skill_id: skill.id })
    // Load users on the skill instance and check reactivity
    await skill.load('users')
    expect(skill.users as UserModel[]).toHaveLength(1)
    expect((skill.users as UserModel[])[0].email).toBe('bob@example.com')
    // Also check the user side
    await user.load('skills')
    expect(user.skills as SkillModel[]).toHaveLength(1)
    expect((user.skills as SkillModel[])[0].name).toBe('Python')
  })

  it('should dissociate a skill from a user', async () => {
    const user = await db.model('users').create({ email: 'carol@example.com' })
    const skill = await db.model('skills').create({ name: 'Go' })
    const join = await db.model('skills_users').create({ user_id: user.id, skill_id: skill.id })
    await user.load('skills')
    expect(user.skills).toHaveLength(1)
    // Listen for property change
    const handler = vi.fn()
    user.onPropertyChange('skills', handler)
    await join.delete()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    expect(user.skills).toHaveLength(0)
  })

  it('should reactively update user.skills when a skill is added', async () => {
    const user = await db.model('users').create({ email: 'dana@example.com' })
    await user.load('skills')
    expect(user.skills).toHaveLength(0)
    const handler = vi.fn()
    user.onPropertyChange('skills', handler)
    const skill = await db.model('skills').create({ name: 'Elm' })
    await db.model('skills_users').create({ user_id: user.id, skill_id: skill.id })
    // Wait for reactivity to propagate
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler).toHaveBeenCalled()
    const callArg = handler.mock.calls[handler.mock.calls.length - 1][0]
    expect(Array.isArray(callArg)).toBe(true)
    expect(callArg).toHaveLength(1)
    expect(callArg[0].name).toBe('Elm')
  })

  it('should allow updating a join to a different user', async () => {
    const user1 = await db.model('users').create({ email: 'eve@example.com' })
    const user2 = await db.model('users').create({ email: 'frank@example.com' })
    const skill = await db.model('skills').create({ name: 'Rust' })
    const join = await db.model('skills_users').create({ user_id: user1.id, skill_id: skill.id })
    await user1.load('skills')
    await user2.load('skills')
    expect(user1.skills).toHaveLength(1)
    expect(user2.skills).toHaveLength(0)
    // Listen for property change
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    user1.onPropertyChange('skills', handler1)
    user2.onPropertyChange('skills', handler2)
    join.user_id = user2.id
    await join.save()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(handler1).toHaveBeenCalled()
    expect(handler2).toHaveBeenCalled()
    expect(user1.skills).toHaveLength(0)
    expect(user2.skills).toHaveLength(1)
    expect(user2.skills[0].name).toBe('Rust')
  })
})
