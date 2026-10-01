/**
 * `a11y/icon-only-control-needs-label`
 *
 * Issue #188: icon-only controls (copy / refresh / close / assistant toggle …)
 * were rendered as a lucide icon inside a button or link with no text, so a
 * screen reader announced them as an unlabelled button.
 *
 * Why this rule exists instead of `jsx-a11y/control-has-associated-label`:
 * jsx-a11y treats *any* JSX element child as accessible content, so
 *
 *     <button onClick={copy}><Copy className="w-3.5" /></button>
 *
 * looks labelled to it and is never reported. `anchor-has-content` has the
 * same blind spot for links. This rule instead asks the right question —
 * "is there any human-readable text or explicit label in this subtree?" —
 * and reports the control when the answer is no.
 *
 * The bubble is strictly visual. A `title` attribute is deliberately NOT
 * accepted: it is an unreliable accessible name (WCAG 2.1 discourages relying
 * on it, and several screen readers ignore it), so controls must use
 * `aria-label` and may use `title` as a sighted-user tooltip on top.
 */

const LABEL_ATTRIBUTES = ['aria-label', 'aria-labelledby']

/** Attributes that hand a control its name from somewhere else. */
const NAME_PROVIDING_ATTRIBUTES = [...LABEL_ATTRIBUTES, 'children', 'dangerouslySetInnerHTML']

/** Intrinsic (lowercase) elements whose subtree is searched for real text. */
const TRANSPARENT_ELEMENTS = new Set([
  'span',
  'div',
  'p',
  'strong',
  'em',
  'b',
  'i',
  'small',
  'label',
  'figcaption',
])

/** Expressions that we cannot reason about, so we assume they yield text. */
const OPAQUE_EXPRESSIONS = new Set([
  'Identifier',
  'CallExpression',
  'MemberExpression',
  'TemplateLiteral',
  'BinaryExpression',
  'TSAsExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
])

function getName(node) {
  if (!node) return null
  if (node.type === 'JSXIdentifier') return node.name
  if (node.type === 'JSXMemberExpression') {
    return `${getName(node.object)}.${getName(node.property)}`
  }
  if (node.type === 'JSXNamespacedName') {
    return `${getName(node.namespace)}:${getName(node.name)}`
  }
  return null
}

function getAttribute(openingElement, name) {
  if (!openingElement || !openingElement.attributes) return null
  return openingElement.attributes.find(attr => attr.type === 'JSXAttribute' && getName(attr.name) === name)
}

function isIntrinsic(node) {
  const name = getName(node.openingElement.name)
  return typeof name === 'string' && /^[a-z]/.test(name)
}

function attributeHasContent(attr) {
  if (!attr || !attr.value) return false
  if (attr.value.type === 'Literal') {
    return typeof attr.value.value === 'string' && attr.value.value.trim().length > 0
  }
  // <button aria-label={label}> — a variable is assumed to carry a value.
  return attr.value.type === 'JSXExpressionContainer'
}

/**
 * Does this expression produce human-readable text we can rely on?
 * Anything opaque (a variable, a call, a template) counts as text so the rule
 * stays quiet on legitimate dynamic labels such as `<span>{label}</span>`.
 */
function expressionHasText(expression) {
  if (!expression) return false

  if (OPAQUE_EXPRESSIONS.has(expression.type)) return true

  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' && expression.value.trim().length > 0
  }

  if (expression.type === 'JSXElement') return elementHasText(expression)

  if (expression.type === 'JSXFragment') return childrenHaveText(expression.children)

  if (expression.type === 'ConditionalExpression') {
    // Icon swaps such as `{copied ? <Check /> : <Copy />}` have no text in
    // either branch and must still be reported.
    return expressionHasText(expression.consequent) || expressionHasText(expression.alternate)
  }

  if (expression.type === 'LogicalExpression') {
    return expressionHasText(expression.left) || expressionHasText(expression.right)
  }

  return false
}

/**
 * Does a list of JSX children contain real text for a human?
 * Shared by element bodies and fragments such as `<><Icon /> Label</>`.
 */
function childrenHaveText(children) {
  for (const child of children) {
    if (child.type === 'JSXText') {
      if (child.value && child.value.trim()) return true
    } else if (child.type === 'JSXExpressionContainer') {
      if (expressionHasText(child.expression)) return true
    } else if (child.type === 'JSXFragment') {
      if (childrenHaveText(child.children)) return true
    } else if (child.type === 'JSXElement') {
      const tag = getName(child.openingElement.name)
      // A lowercase element such as <span> is transparent: look through it.
      // A capitalised one (<Copy />, <Bot />) is an icon/graphic, not a name.
      if (tag && TRANSPARENT_ELEMENTS.has(tag)) {
        if (elementHasText(child)) return true
      } else if (tag === 'img' || tag === 'input') {
        if (attributeHasContent(getAttribute(child.openingElement, 'alt'))) return true
        if (tag === 'input' && attributeHasContent(getAttribute(child.openingElement, 'value'))) return true
      }
    }
  }
  return false
}

/** Does the subtree rooted at `element` contain real text for a human? */
function elementHasText(element) {
  return childrenHaveText(element.children)
}

/** `<a>` only needs a name when it actually navigates somewhere. */
function isInteractiveAnchor(openingElement) {
  if (getName(openingElement.name) !== 'a') return false
  return attributeHasContent(getAttribute(openingElement, 'href'))
    || attributeHasContent(getAttribute(openingElement, 'xlink:href'))
    || getAttribute(openingElement, 'href')?.value?.type === 'JSXExpressionContainer'
}

function isTargetElement(openingElement, elements) {
  const tag = getName(openingElement.name)
  if (!tag) return false
  if (tag === 'a') return isInteractiveAnchor(openingElement)
  if (tag === 'input') {
    // Text inputs get their name from a <label>; that is out of scope here.
    const type = getAttribute(openingElement, 'type')?.value?.value
    return type === 'button' || type === 'submit' || type === 'reset'
  }
  return elements.includes(tag)
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce an accessible name on icon-only buttons, links and other controls that contain no text.',
      recommended: true,
      url: 'https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/issues/188',
    },
    schema: [
      {
        type: 'object',
        properties: {
          elements: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingLabel:
        '{{element}} has no accessible name. Add `aria-label` (icons inside should be `aria-hidden="true"`).',
    },
  },

  create(context) {
    const { elements = ['button'] } = context.options[0] ?? {}

    return {
      JSXOpeningElement(node) {
        if (!isTargetElement(node, elements)) return

        // Named from somewhere else (aria-label, children prop, …).
        const hasExternalName = NAME_PROVIDING_ATTRIBUTES.some(name =>
          attributeHasContent(getAttribute(node, name)),
        )
        if (hasExternalName) return

        const parent = node.parent
        if (parent && parent.type === 'JSXElement' && elementHasText(parent)) return

        context.report({ node, messageId: 'missingLabel', data: { element: `<${getName(node.name)}>` } })
      },
    }
  },
}

export default rule
