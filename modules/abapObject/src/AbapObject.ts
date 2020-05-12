import {
  AbapObjectStructure,
  MainInclude,
  NodeStructure,
  isNodeParent
} from "abap-adt-api"
import { AbapObjectService } from "./AOService"
import { ObjectErrors } from "./AOError"
const SAPGUIONLY =
  "Objects of this type are only supported in SAPGUI. Press F5 to edit in sapgui"
const NSSLASH = "\u2215" // used to be hardcoded as "／", aka "\uFF0F"
export const PACKAGE = "DEVC/K"
export const TMPPACKAGE = "$TMP"
export const PACKAGEBASEPATH = "/sap/bc/adt/repository/nodestructure"
export const convertSlash = (x: string) => x && x.replace(/\//g, NSSLASH)
const objectTag = Symbol("abapObject")

export interface AbapObject {
  readonly [objectTag]: true
  /** unique object ID, usually type and name */
  readonly key: string
  /** as defined in ADT, i.e. PROG/P for programs */
  readonly type: string
  /** the raw object name */
  readonly name: string
  /** Object technical name, i.e. main, testclasses,... */
  readonly techName: string
  /** object path in ADT, used to retrieve metadata or source */
  readonly path: string
  /** the path for read and write operations */
  contentsPath(): string
  /** true if the object has children, i.e. class */
  readonly expandable: boolean
  /** Object structure i.e. activation flag, last change data,... */
  readonly structure?: AbapObjectStructure
  /** sanitized name usable in a filesystem. i.e. replace / with some other character */
  readonly fsName: string
  /** the object to lock when editing. i.e. the function group of a function */
  readonly lockObject: AbapObject
  /** user who created the object. Only available after loading the metadata */
  readonly createdBy: string
  /** time of creation. Only available after loading the metadata */
  readonly createdAt: Date | undefined
  /** user who last changed the object. Only available after loading the metadata */
  readonly changedBy: string
  /** time of last change. Only available after loading the metadata */
  readonly changedAt: Date | undefined
  /** reads the main objects available for this object */
  mainPrograms: () => Promise<MainInclude[]>
  /** whether we are able to write it */
  readonly canBeWritten: boolean
  /** objcect namespace
   *  i.e. for /UI5/IF_ADT_REP_MODEL is /UI5/
   */
  readonly nameSpace: string
  /** object base name
   *   i.e. for /UI5/IF_ADT_REP_MODEL is IF_ADT_REP_MODEL
   */
  readonly baseName: string
  /** used to open the object in SAPGUI */
  readonly sapGuiUri: string
  /** supported or only sapgui */
  readonly supported: boolean

  /** loads/updates the object metadata */
  loadStructure: () => Promise<AbapObjectStructure>
  delete: (lockId: string, transport: string) => Promise<void>
  write: (contents: string, lockId: string, transport: string) => Promise<void>
  read: () => Promise<string>
  childComponents: () => Promise<NodeStructure>
}

export type AbapObjectConstructor = new (
  type: string,
  name: string,
  path: string,
  expandable: boolean,
  techName: string,
  parent: AbapObject | undefined,
  sapGuiUri: string,
  client: AbapObjectService
) => AbapObject
export const isAbapObject = (x: any): x is AbapObject => !!x?.[objectTag]

const followPath = (base: string, suffix: string) => {
  if (suffix) {
    if (suffix.match(/^\.\//))
      return `${base.replace(/\/[^\/]*$/, "")}${suffix.substr(1)}`
    return suffix.match(/^\//) ? suffix : `${base}/${suffix}`
  }
}
export class AbapObjectBase implements AbapObject {
  readonly [objectTag]: true
  constructor(
    readonly type: string,
    readonly name: string,
    readonly path: string,
    readonly expandable: boolean,
    readonly techName: string,
    readonly parent: AbapObject | undefined,
    readonly sapGuiUri: string,
    protected readonly service: AbapObjectService
  ) {
    this.supported =
      this.type !== "IWSV" &&
      !path.match(
        "(/sap/bc/adt/vit)|(/sap/bc/adt/ddic/domains/)|(/sap/bc/adt/ddic/dataelements/)|(/sap/bc/esproxy)"
      )
  }
  structure?: AbapObjectStructure
  readonly supported: boolean

  get canBeWritten() {
    return this.supported && !this.expandable
  }
  get key() {
    return `${this.type} ${this.name}`
  }
  get extension(): string {
    return this.expandable ? "" : this.supported ? ".abap" : ".txt"
  }
  get fsName() {
    return `${convertSlash(this.name)}${this.extension}`
  }
  get lockObject(): AbapObject {
    return this
  }
  get createdBy() {
    return this.structure?.metaData["adtcore:responsible"] || ""
  }
  get createdAt() {
    const ts = this.structure?.metaData["adtcore:createdAt"]
    return ts ? new Date(ts) : undefined
  }
  get changedBy() {
    return this.structure?.metaData["adtcore:changedBy"] || ""
  }
  get changedAt() {
    const ts = this.structure?.metaData["adtcore:changedAt"]
    return ts ? new Date(ts) : undefined
  }
  get nameSpace() {
    const m = this.name.match(/^(\/[^\/]+\/)/)
    return (m && m[1]) || ""
  }
  get baseName() {
    return this.name.replace(/^(\/[^\/]+\/)/, "")
  }
  contentsPath() {
    if (this.expandable) throw ObjectErrors.notLeaf(this)
    if (!this.supported) throw ObjectErrors.NotSupported(this)
    if (!this.structure) throw ObjectErrors.noStructure(this)
    const suffix =
      this.structure?.metaData["abapsource:sourceUri"] ||
      this.structure?.links?.find(
        l =>
          l.type === "text/plain" &&
          l.rel === "http://www.sap.com/adt/relations/source"
      )?.href ||
      ""
    const path = followPath(this.path, suffix)
    if (path) return path
    throw ObjectErrors.notLeaf(this)
  }

  async mainPrograms() {
    if (!this.supported) throw ObjectErrors.NotSupported(this)
    if (this.expandable) throw ObjectErrors.notLeaf(this)
    return this.service.mainPrograms(this.path)
  }

  async loadStructure(): Promise<AbapObjectStructure> {
    if (!this.name) throw ObjectErrors.noStructure(this)
    this.structure = await this.service.objectStructure(
      this.path.replace(/\/source\/main$/, "")
    )
    return this.structure
  }
  async delete(lockId: string, transport = "") {
    return this.service.delete(this.path, lockId, transport)
  }

  async write(contents: string, lockId: string, transport: string) {
    if (this.expandable) throw ObjectErrors.notLeaf(this)
    if (!this.canBeWritten) throw ObjectErrors.NotSupported(this)
    await this.service.setObjectSource(
      this.contentsPath(),
      contents,
      lockId,
      transport
    )
    this.service.invalidateStructCache(this.path)
    if (this.lockObject !== this)
      this.service.invalidateStructCache(this.lockObject.path)
  }

  async read() {
    if (this.expandable) throw ObjectErrors.notLeaf(this)
    if (!this.supported) return SAPGUIONLY
    return this.service.getObjectSource(this.contentsPath())
  }

  protected filterInvalid(original: NodeStructure): NodeStructure {
    const { nodes, objectTypes } = original
    const valid = nodes.filter(
      n =>
        (n.OBJECT_TYPE === PACKAGE || !n.OBJECT_TYPE.match(/DEVC\//)) &&
        !!n.OBJECT_URI
    )
    const types = objectTypes
      .filter(t => t.OBJECT_TYPE === PACKAGE || !t.OBJECT_TYPE.match(/DEVC\//))
      .map(t => {
        if (t.OBJECT_TYPE_LABEL) return t
        const aliasId = t.OBJECT_TYPE.replace(/^[^\/]+\//, "DEVC/")
        const alias = objectTypes.find(ot => ot.OBJECT_TYPE === aliasId)
        return alias ? { ...t, OBJECT_TYPE_LABEL: alias.OBJECT_TYPE_LABEL } : t
      })
    return { ...original, nodes: valid, objectTypes: types }
  }

  async childComponents(): Promise<NodeStructure> {
    if (!this.expandable) throw ObjectErrors.isLeaf(this)
    if (!isNodeParent(this.type)) throw ObjectErrors.NotSupported(this)
    const unfiltered = await this.service.nodeContents(this.type, this.name)
    return this.filterInvalid(unfiltered)
  }
}
