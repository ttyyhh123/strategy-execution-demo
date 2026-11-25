import { answerPolicy, blockingIssues, checkApplication } from './agentPolicy.js'
import { applicationFields, chooseType, makeDraft, nextQuestion, parseAnswer } from './applicationDraft.js'
import { makeId } from './domain.js'

const typeLabels = { 产品开发类: 'product', 技术研究类: 'research' }
const policyTopics = /立项|规则|材料|投资|预算|审批|送审|目标|准入|分级|预警|验证|类型|回报|试用|模板|字段/u

function isQuestion(text, askingForField) {
  if (/^(?:请问|想了解|帮我查|查一下|看看|查看|查询|了解|怎么|如何|能否|是否)|[？?]$/u.test(text)) return true
  if (/^(?:立项|申报|审批|项目|产品|技术|客户|年度|预算|投资|材料|延期|预警).{0,22}(?:怎么|如何|什么|哪些|多少|是否|能否|多久|可以吗|呢[。！!]?$)/u.test(text)) return true
  return !askingForField && /什么|哪些|怎么|如何|是否|能否|多少|多久|吗[。！!]?$|呢[。！!]?$/u.test(text)
}

function startRequest(text) {
  const request = text.replace(/^(?:(?:请|麻烦|现在|我想要|我想|我要|我需要|帮我|给我)\s*)+/u, '')
  return /^(?:(?:发起|启动|新建|创建|开始|申请|提交|准备|填写)(?:一个|一项)?\s*(?:立项|申报|申请|审批|项目|产品开发|技术研究)|立项做|申报(?:一个|一项|产品|技术|项目)|(?:立项|申报)[。！!]?$)/u.test(request)
}

function declaredType(text) {
  const product = /产品(?:开发|研发)(?:类)?/u.test(text)
  const research = /技术研究(?:类)?/u.test(text)
  if (product === research) return ''
  return product ? 'product' : 'research'
}

function startDraft(chat, text) {
  chat.started = true
  const type = declaredType(text)
  if (type) chooseType(chat.draft, type)
  const name = text.match(/(?:项目名称[：:]\s*|项目叫(?:做)?\s*|立项做\s*|[，,]\s*叫(?:做)?\s*)[「“《]?([^\n，,。；;「」“”《》]{1,60})/u)?.[1]
  if (name) chat.draft.name = name.trim()
  continueApplication(chat, '已开始立项申报。')
}

export function createApplicationChat(project, start = false) {
  const chat = { id: makeId('chat'), recordId: project?.id || null, draft: makeDraft(project), started: Boolean(project || start), submitted: false, messages: [], lastPolicy: '' }
  if (project?.status === 'returned') {
    pushMessage(chat, 'assistant', '这份申报已退回。审批人留言：' + (project.reviews.at(-1)?.reason || '请补充材料。'))
  }
  if (chat.started) continueApplication(chat, project ? '已打开「' + project.name + '」的草稿。' : '我们先准备立项申请。')
  return chat
}

export function pushMessage(chat, role, text, fields = {}) {
  chat.messages.push({ role, text, ...fields })
}

export function reviewApplication(chat, prefix = '') {
  const checks = blockingIssues(checkApplication(chat.draft))
  pushMessage(chat, 'assistant', [prefix, checks.length ? '这份申请暂时不能送审。请先处理下面的问题。' : '材料已通过演示规则校验。请确认草稿和审批路径，再提交审批。'].filter(Boolean).join('\n'), { kind: 'review', checks })
}

export function continueApplication(chat, prefix = '') {
  const question = nextQuestion(chat.draft)
  if (!question) return reviewApplication(chat, prefix)
  pushMessage(chat, 'assistant', [prefix, question.prompt].filter(Boolean).join('\n'), { kind: question.key === 'type' ? 'select-type' : 'message' })
}

function answerQuestion(chat, text) {
  const typeFollowup = /^(?:那|那么|换成)?\s*(?:产品开发|技术研究)类?\s*(?:呢|怎么样)[？?。]?$/u.test(text)
  const scope = declaredType(text) || chat.draft.application.type
  const query = typeFollowup ? (chat.lastPolicy || '需要哪些申报材料').replace(/产品(?:开发|研发)类?|技术研究类?/gu, '') : text
  const result = answerPolicy(query, scope)
  if (!typeFollowup && result.sources.length) chat.lastPolicy = text
  pushMessage(chat, 'assistant', result.text, { sources: result.sources })
}

export function respondToApplication(chat, text) {
  const question = chat.started && !chat.submitted ? nextQuestion(chat.draft) : null
  const type = Object.hasOwn(typeLabels, text) ? typeLabels[text] : ''
  const asks = isQuestion(text, Boolean(question)) || (!chat.started && !startRequest(text) && policyTopics.test(text))
  pushMessage(chat, 'user', text)

  if (/^(?:你好|您好|哈喽|hi|hello)[，。！! ]*$/iu.test(text)) {
    pushMessage(chat, 'assistant', '你好！可以直接问我立项规则，或告诉我你想申报什么项目。')
  } else if (asks) {
    answerQuestion(chat, text)
  } else if (!chat.started && (type || startRequest(text))) {
    startDraft(chat, text)
  } else if (!chat.started) {
    pushMessage(chat, 'assistant', '如果你准备申报，可以说「我想发起立项」并带上项目名称。也可以先问我需要准备哪些材料。')
  } else if (chat.submitted) {
    pushMessage(chat, 'assistant', '这份申请已送审。你可以继续问规则，或开启新对话准备另一份申请。')
  } else if (/^(?:请|帮我|请帮我)?(?:提交审批|确认送审|发起审批|送审|检查|校验|提交)(?:申报草稿|草稿|申请|申报)?[。！!]?$/u.test(text)) {
    reviewApplication(chat)
  } else if (type && question?.key === 'type') {
    chooseType(chat.draft, type)
    continueApplication(chat)
  } else if (applyDraftReply(chat, text, question)) {
    continueApplication(chat, '已更新申报草稿。')
  } else if (question) {
    pushMessage(chat, 'assistant', '我还需要补齐这项信息。' + question.prompt, { kind: question.key === 'type' ? 'select-type' : 'message' })
  } else {
    pushMessage(chat, 'assistant', '可以说「把投资额改为 120 万元」，或输入「补充材料：名称：原文」。也可以打开草稿手动补录。')
  }
}

function applyDraftReply(chat, text, question) {
  const draft = chat.draft
  const material = text.match(/^(?:补充材料|添加材料|附件)\s*[：:]\s*(\S[\s\S]*)$/u)?.[1]
  if (material) return parseAnswer(draft, { key: 'material' }, material)
  const correction = text.match(/^(?:请)?(?:把|将)?(.{1,20}?)(?:改为|改成|修改为)\s*(.+)$/su)
  if (correction) {
    const field = applicationFields(draft).find(item => item.label.split('（')[0] === correction[1])
    return Boolean(field && parseAnswer(draft, field, correction[2].trim().replace(/[。！!]$/u, '')))
  }
  if (draft.application.type === 'product' && /^(?:[\u4e00-\u9fff]{1,20}[：:])?客户.*(?:已确认|明确同意).*试用/u.test(text) && (!question || question.key === 'material')) {
    return parseAnswer(draft, { key: 'material' }, /[：:]/u.test(text) ? text : '客户试用确认说明：' + text)
  }
  return Boolean(question && parseAnswer(draft, question, text))
}

export function applicationTitle(chat) {
  return chat.draft.name || chat.messages.find(item => item.role === 'user')?.text.trim().split('\n')[0] || '新对话'
}

