import type { EntityInput } from '#orm'
import { AbstractEntity, Column, Entity } from '#orm'

@Entity('tag')
export class Tag extends AbstractEntity {
  @Column('text', { nullable: false, unique: true })
  name: string

  constructor(data: EntityInput<Tag>) {
    super()

    this.name = data.name
  }
}
