import { Emitter, CompositeDisposable, Disposable } from 'atom'
import debounce from 'lodash/debounce'
import type { TextEditor } from 'atom'

export default class EditorLinter {
  editor: TextEditor
  emitter: Emitter
  subscriptions: CompositeDisposable

  constructor(editor: TextEditor) {
    if (!atom.workspace.isTextEditor(editor)) {
      throw new Error('EditorLinter expects a valid TextEditor')
    }
    const editorBuffer = editor.getBuffer()
    const debouncedLint = debounce(
      () => {
        this.emitter.emit('should-lint', false)
      },
      50,
      { leading: true },
    )

    this.editor = editor
    this.emitter = new Emitter()
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.editor.onDidDestroy(() => this.dispose()))
    // This debouncing is for beautifiers, if they change contents of the editor and save
    // Linter should count that group of events as one.
    this.subscriptions.add(this.editor.onDidSave(debouncedLint))
    // This is to relint in case of external changes to the opened file
    this.subscriptions.add(editorBuffer.onDidReload(debouncedLint))
    // NOTE: TextEditor::onDidChange immediately invokes the callback if the text editor was *just* created
    // Using TextBuffer::onDidChange doesn't have the same behavior so using it instead.
    this.subscriptions.add(
      this.subscriptiveObserve(atom.config, 'linter.lintOnChangeInterval', interval =>
        editorBuffer.onDidChange(
          debounce(() => {
            this.emitter.emit('should-lint', true)
          }, interval),
        ),
      ),
    )
  }
  getEditor(): TextEditor {
    return this.editor
  }
  lint(onChange: boolean = false) {
    this.emitter.emit('should-lint', onChange)
  }
  onShouldLint(callback: (...args: Array<any>) => any): Disposable {
    return this.emitter.on('should-lint', callback)
  }
  onDidDestroy(callback: (...args: Array<any>) => any): Disposable {
    return this.emitter.on('did-destroy', callback)
  }
  dispose() {
    this.emitter.emit('did-destroy')
    this.subscriptions.dispose()
    this.emitter.dispose()
  }

  subscriptiveObserve(object: Record<string, any>, eventName: string, callback: (...args: Array<any>) => any): Disposable {
    let subscription: Disposable | null = null
    const eventSubscription = object.observe(eventName, (props: Record<string, any>) => {
      if (subscription) {
        subscription.dispose()
      }
      // TODO what is this?!
      subscription = callback.call(this, props)
    })

    return new Disposable(function () {
      eventSubscription.dispose()
      if (subscription) {
        subscription.dispose()
      }
    })
  }
}
