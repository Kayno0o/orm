import path from 'node:path'
import { AbstractRepository, getRepository, initDB } from '#orm'
import { randomString } from '@kaynooo/utils'
import { Database } from 'bun:sqlite'
import { Tag } from './entities/tag'
import { User } from './entities/user'
import { UserRepository } from './repositories/userRepository'

// enable migration confirmations via environment variable
// process.env.CONFIRM_DB_MIGRATIONS = 'true'

await initDB(new Database(path.resolve(import.meta.dir, 'data.sqlite')), [
  new UserRepository(),
  new AbstractRepository(Tag),
])

const tagRepo = getRepository(Tag)
const tag = tagRepo.create({ name: `tag_${randomString(10)}` })

const userRepo = getRepository(User)
const newUser = userRepo.create({ username: `user_${randomString(10)}`, tag_id: tag.id })

console.log('Created user:', newUser)
console.log('User\'s tag:', newUser.getTag())
console.log(userRepo.update(newUser.id, newUser))

console.log('find in 3,4,5', userRepo.findAllBy({ where: { id: [3, 4, 5, 6, 7, 9, 10] } }))

console.log('user no tag', userRepo.create({ username: `user_notag_${randomString(10)}` }))
