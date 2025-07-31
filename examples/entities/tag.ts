import type { EntityInput } from '#orm'
import { AbstractEntity, Column, Entity } from '#orm'

@Entity('tag')
export class Tag extends AbstractEntity {
  @Column('text', { nullable: false, unique: true })
  name: string

  @Column('text', { nullable: true, unique: true })
  wiwiwi: string | null = null

  constructor(data: EntityInput<Tag>) {
    super()

    this.name = data.name
  }
}
