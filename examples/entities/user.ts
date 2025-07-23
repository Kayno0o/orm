import { AbstractEntity, Column, Entity, getRepository } from '#orm'
import { Tag } from './tag'

@Entity('user')
export class User extends AbstractEntity {
  @Column('text', { nullable: false, unique: true })
  username: string

  @Column('int', { nullable: true, unique: false, primary: true, reference: { key: 'id', table: 'tag' } })
  tag_id: number | null = null

  // error: invalid type. should be number|null
  @Column('int', { nullable: true, unique: false, primary: true, reference: { key: 'id', table: 'tag' } })
  tag_id2?: string

  _cache: {
    tag?: Tag | null
  } = {}

  constructor(data: { username: string }) {
    super()

    this.username = data.username
  }

  getTag(): Tag | null {
    if (!this.tag_id)
      return null

    return this._cache.tag ??= getRepository(Tag).find(this.tag_id)
  }
}
