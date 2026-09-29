import { GoogleGenAI } from '@google/genai'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const TARGET_LOCALES = {
  bn: 'Bengali (বাংলা) — use natural, simple Bangladeshi Bengali suitable for a business app UI',
}

// Comprehensive high-quality Bengali translation dictionary for UI strings
const FALLBACK_BN_DICTIONARY = {
  LoginPage: {
    titleAccept: "আমন্ত্রণ গ্রহণ করুন",
    titleWelcome: "স্বাগতম",
    descAccept: "আপনার অ্যাকাউন্টে প্রবেশ করতে সাইন ইন করুন এবং আমন্ত্রণ গ্রহণ করুন।",
    descWelcome: "হোয়াটসঅ্যাপ সিআরএম-এ স্বাগতম",
    emailLabel: "ইমেইল ঠিকানা",
    emailPlaceholder: "name@company.com",
    passwordLabel: "পাসওয়ার্ড",
    forgotPassword: "পাসওয়ার্ড ভুলে গেছেন?",
    passwordPlaceholder: "আপনার পাসওয়ার্ড লিখুন",
    signingIn: "সাইন ইন হচ্ছে...",
    signIn: "সাইন ইন করুন",
    noAccount: "অ্যাকাউন্ট নেই?",
    createAccount: "নতুন অ্যাকাউন্ট তৈরি করুন",
    linkExpired: "লিংকের মেয়াদ শেষ",
    linkInvalid: "অকার্যকর লিংক"
  },
  ModeToggle: {
    switchMode: "থিম পরিবর্তন করুন"
  },
  AccountAccess: {
    unlinkedTitle: "অ্যাকাউন্ট সংযুক্ত নয়",
    unlinkedBody: "আপনার অ্যাকাউন্টটি কোনো টিমের সাথে যুক্ত করা হয়নি।",
    errorTitle: "ত্রুটি ঘটেছে",
    errorBody: "অ্যাকাউন্ট অ্যাক্সেস যাচাই করা সম্ভব হয়নি।",
    retry: "আবার চেষ্টা করুন"
  },
  Dashboard: {
    page: {
      title: "ড্যাশবোর্ড",
      description: "কনভার্সেশন, কন্টাক্ট, ডিল, ব্রডকাস্ট এবং অটোমেশনের লাইভ অ্যানালিটিক্স।",
      activeConversations: "সক্রিয় কনভার্সেশন",
      newContactsToday: "আজকের নতুন কন্টাক্ট",
      openDealsValue: "চলতি ডিলের মোট মূল্য",
      messagesSentToday: "আজ প্রেরিত বার্তা",
      newTodayVsYesterday: "গতকালকের তুলনায় আজ নতুন",
      vsYesterday: "গতকালকের তুলনায়",
      openDeals: "{count}টি উন্মুক্ত {count, plural, =1 {ডিল} other {ডিল}}",
      noChange: "কোনো পরিবর্তন নেই {suffix}"
    },
    quickActions: {
      title: "দ্রুত অ্যাকশন",
      newBroadcast: "নতুন ব্রডকাস্ট",
      addContact: "কন্টাক্ট যোগ করুন",
      viewInbox: "ইনবক্স দেখুন",
      newFlow: "নতুন ফ্লো তৈরি করুন"
    },
    activityFeed: {
      title: "সাম্প্রতিক অ্যাক্টিভিটি",
      noActivity: "কোনো সাম্প্রতিক অ্যাক্টিভিটি নেই"
    },
    conversationsChart: {
      title: "কনভার্সেশন ট্রেন্ড",
      subtitle: "গত ৭ দিনের বার্তা প্রবাহ"
    },
    pipelineDonut: {
      title: "ডিল পাইপলাইন",
      subtitle: "পর্যায়ভিত্তিক ডিলের বিবরণ"
    },
    responseTimeChart: {
      title: "গড় রেসপন্স টাইম",
      subtitle: "টিমের উত্তর দেওয়ার গড় সময়"
    },
    emptyState: {
      title: "কোনো ডাটা নেই",
      description: "আপনার ড্যাশবোর্ড আপডেট করতে প্রথম কনভার্সেশন বা কন্টাক্ট শুরু করুন।"
    }
  },
  Inbox: {
    page: {
      title: "ইনবক্স",
      description: "গ্রাহকদের বার্তা পরিচালনা করুন ও টিমের সাথে যৌথভাবে উত্তর দিন।"
    },
    conversationList: {
      searchPlaceholder: "কনভার্সেশন খুঁজুন...",
      filterAll: "সব",
      filterUnread: "অপঠিত",
      filterAssigned: "আমার দায়িত্বে",
      noConversations: "কোনো কনভার্সেশন পাওয়া যায়নি"
    },
    messageThread: {
      typeMessage: "বার্তা লিখুন...",
      send: "পাঠান",
      internalNote: "অভ্যন্তরীণ নোট"
    },
    sessionTimer: {
      sessionActive: "২৪ ঘণ্টার সেশন সক্রিয়",
      sessionExpired: "২৪ ঘণ্টার সেশনের মেয়াদ শেষ — কেবল টেমপ্লেট পাঠাতে পারবেন"
    },
    composer: {
      placeholder: "বার্তা লিখুন...",
      attachFile: "ফাইল যুক্ত করুন",
      sendTemplate: "টেমপ্লেট পাঠান"
    },
    bubble: {
      delivered: "প্রেরিত",
      read: "পঠিত",
      failed: "ব্যর্থ"
    },
    mediaViewer: {
      download: "ডাউনলোড",
      close: "বন্ধ করুন"
    },
    actions: {
      assignTo: "দায়িত্ব দিন",
      markAsDone: "সম্পন্ন চিহ্নিত করুন",
      reopen: "পুনরায় খুলুন"
    },
    replyQuote: {
      replyingTo: "উত্তর দেওয়া হচ্ছে",
      cancel: "বাতিল"
    },
    templatePicker: {
      selectTemplate: "টেমপ্লেট নির্বাচন করুন",
      searchTemplate: "টেমপ্লেট খুঁজুন..."
    },
    sidebar: {
      contactDetails: "কন্টাক্ট বিবরণ",
      tags: "ট্যাগ",
      customFields: "কাস্টম ফিল্ড"
    },
    aiBanner: {
      aiReplying: "এআই এজেন্ট উত্তর দিচ্ছে...",
      takeOver: "নিয়ন্ত্রণ নিন"
    }
  },
  Contacts: {
    page: {
      title: "কন্টাক্টস",
      description: "আপনার গ্রাহকদের তথ্য ও ইতিহাস সংরক্ষণ ও পরিচালনা করুন।"
    },
    form: {
      name: "নাম",
      phone: "ফোন নম্বর",
      email: "ইমেইল",
      save: "সংরক্ষণ করুন",
      cancel: "বাতিল"
    },
    detailView: {
      about: "বিবরণ",
      conversations: "কনভার্সেশনসমূহ",
      notes: "নোটসমূহ"
    },
    importModal: {
      title: "কন্টাক্ট ইমপোর্ট করুন",
      uploadCsv: "সিএসভি ফাইল আপলোড করুন",
      importing: "ইমপোর্ট হচ্ছে..."
    },
    customFields: {
      addField: "ফিল্ড যুক্ত করুন",
      fieldName: "ফিল্ডের নাম"
    }
  },
  Pipelines: {
    page: {
      title: "পাইপলাইন",
      description: "বিক্রয় ও ডিলের অগ্রগতি ট্র্যাক করুন।"
    },
    board: {
      addDeal: "নতুন ডিল",
      noDeals: "এই পর্যায়ে কোনো ডিল নেই"
    },
    card: {
      value: "মূল্য",
      contact: "কন্টাক্ট"
    },
    form: {
      dealTitle: "ডিলের শিরোনাম",
      amount: "পরিমাণ",
      stage: "পর্যায়",
      save: "সংরক্ষণ করুন"
    },
    settings: {
      stages: "পাইপলাইন পর্যায়সমূহ",
      addStage: "পর্যায় যোগ করুন"
    },
    analytics: {
      totalValue: "মোট মূল্য",
      winRate: "সফলতার হার"
    }
  },
  Broadcasts: {
    page: {
      title: "ব্রডকাস্ট",
      description: "একসাথে একাধিক গ্রাহককে বাল্ক বার্তা পাঠান।"
    },
    status: {
      sent: "প্রেরিত",
      pending: "অপেক্ষমাণ",
      failed: "ব্যর্থ"
    },
    detail: {
      recipients: "প্রাপক সংখ্যা",
      deliveredCount: "বিতরণকৃত"
    },
    new: {
      createTitle: "নতুন ব্রডকাস্ট তৈরি করুন"
    },
    wizard: {
      step1: "টার্গেট দর্শক নির্বাচন",
      step2: "টেমপ্লেট নির্বাচন",
      step3: "যাচাই ও প্রেরণ"
    }
  },
  Automations: {
    list: {
      title: "অটোমেশন",
      description: "স্বয়ংক্রিয় ওয়ার্কফ্লো ও উত্তর সেটআপ করুন।",
      newAutomation: "নতুন অটোমেশন"
    },
    edit: {
      trigger: "ট্রিপার",
      action: "অ্যাকশন"
    },
    logs: {
      executionLogs: "এক্সিকিউশন লগ"
    },
    relative: {
      ago: "পূর্বে"
    },
    builder: {
      addNode: "ধাপ যোগ করুন"
    }
  },
  Flows: {
    list: {
      title: "ফ্লো",
      description: "ইন্টারেক্টিভ চ্যাট ফ্লো তৈরি করুন।"
    },
    edit: {
      editFlow: "ফ্লো এডিট করুন"
    },
    logs: {
      flowLogs: "ফ্লো লগ"
    },
    builder: {
      canvas: "ক্যানভাস"
    },
    validation: {
      noErrors: "কোনো ত্রুটি নেই"
    },
    editorState: {
      saved: "সংরক্ষিত"
    },
    summary: {
      nodesCount: "মোট ধাপ"
    },
    header: {
      publish: "পাবলিশ করুন"
    }
  },
  Settings: {
    pageTitle: "সেটিংস",
    pageDesc: "অ্যাকাউন্ট, টিম মেম্বার, হোয়াটসঅ্যাপ এপিআই ও চ্যানেল পরিচালনা করুন।",
    sectionsNav: "সেটিংস মেনু",
    overview: {
      title: "ওভারভিউ",
      description: "আপনার অ্যাকাউন্টের স্ট্যাটাস, সেশন ও টিম মেম্বারদের বিবরণ দেখুন।",
      accountStatus: "অ্যাকাউন্ট স্ট্যাটাস",
      activeMembers: "সক্রিয় মেম্বার",
      connectedChannels: "সংযুক্ত চ্যানেল",
      usageOverview: "ব্যবহারের বিবরণ"
    },
    sections: {
      overview: "ওভারভিউ",
      profile: "আপনার প্রোফাইল",
      security: "লগইন ও সিকিউরিটি",
      appearance: "অ্যাপিয়ারেন্স",
      whatsapp: "হোয়াটসঅ্যাপ",
      templates: "টেমপ্লেট",
      "quick-replies": "দ্রুত উত্তর (Quick replies)",
      fields: "ফিল্ড ও ট্যাগ",
      deals: "ডিল ও মুদ্রা",
      members: "টিম মেম্বারস",
      api: "এপিআই কি (API keys)"
    },
    groups: {
      account: "অ্যাকাউন্ট",
      workspace: "ওয়ার্কস্পেস"
    },
    profile: {
      title: "আপনার প্রোফাইল",
      description: "অ্যাপে আপনার পরিচয় কীভাবে প্রদর্শিত হবে। আপনার ছবি ও নাম হেডার, সাইডবার ও টিমের কাছে দৃশ্যমান থাকবে।",
      changePhoto: "ছবি পরিবর্তন করুন",
      uploadPhoto: "ছবি আপলোড করুন",
      remove: "সরিয়ে ফেলুন",
      photoHint: "PNG, JPG, WebP, বা GIF। সর্বোচ্চ ২ মেগাবাইট।",
      unknownError: "অজানা ত্রুটি",
      displayName: "প্রদর্শিত নাম",
      email: "ইমেইল ঠিকানা",
      emailChangeHint: "নতুন ও পুরাতন উভয় ইমেইলে ভেরিফিকেশন লিংক পাঠানো হবে।",
      accountDetails: "অ্যাকাউন্টের বিবরণ",
      role: "ভূমিকা",
      joined: "যোগদান করেছেন",
      userId: "ইউজার আইডি",
      loading: "প্রোফাইল লোড হচ্ছে…",
      saving: "সংরক্ষণ হচ্ছে…",
      saveChanges: "পরিবর্তন সংরক্ষণ করুন",
      unsupportedImage: "অসমর্থিত ছবির ফরম্যাট",
      unsupportedImageDesc: "PNG, JPG, WebP, বা GIF ফরম্যাট ব্যবহার করুন।",
      imageTooLarge: "ছবির আকার অনেক বড়",
      imageTooLargeDesc: "সর্বোচ্চ ২ মেগাবাইট।",
      nameRequired: "প্রদর্শিত নাম আবশ্যক",
      invalidEmail: "সঠিক ইমেইল ঠিকানা প্রদান করুন",
      uploadFailed: "আপলোড ব্যর্থ হয়েছে: {message}",
      saveFailed: "সংরক্ষণ ব্যর্থ হয়েছে: {message}",
      profileSaved: "প্রোফাইল সংরক্ষিত হয়েছে",
      emailChangeFailed: "ইমেইল পরিবর্তন ব্যর্থ হয়েছে: {message}",
      profileSavedEmailCheck: "প্রোফাইল সংরক্ষিত হয়েছে — ইমেইল নিশ্চিত করুন",
      passwordTitle: "পাসওয়ার্ড",
      passwordDesc: "কমপক্ষে {min} অক্ষরের পাসওয়ার্ড ব্যবহার করুন।",
      currentPassword: "বর্তমান পাসওয়ার্ড",
      newPassword: "নতুন পাসওয়ার্ড",
      confirmPassword: "নতুন পাসওয়ার্ড নিশ্চিত করুন",
      updating: "আপডেট হচ্ছে…",
      updatePassword: "পাসওয়ার্ড আপডেট করুন",
      cannotChangeNoEmail: "ইমেইল ছাড়া পাসওয়ার্ড পরিবর্তন করা যাবে না",
      passwordTooShort: "পাসওয়ার্ড কমপক্ষে {min} অক্ষরের হতে হবে",
      passwordMismatch: "নতুন পাসওয়ার্ড মিলছে না",
      currentPasswordIncorrect: "বর্তমান পাসওয়ার্ড ভুল",
      passwordUpdateFailed: "পাসওয়ার্ড আপডেট ব্যর্থ হয়েছে: {message}",
      passwordUpdated: "পাসওয়ার্ড আপডেট হয়েছে",
      sessionsTitle: "সক্রিয় সেশনসমূহ",
      sessionsDesc: "অন্যান্য ডিভাইসের সেশন বন্ধ করুন।",
      signOutAll: "সকল ডিভাইস থেকে সাইন আউট করুন",
      signOutConfirmTitle: "সব জায়গা থেকে সাইন আউট করবেন?",
      signOutConfirmDesc: "আপনার অ্যাকাউন্টযুক্ত সকল ডিভাইস থেকে সাইন আউট হয়ে যাবে।",
      cancel: "বাতিল",
      signingOut: "সাইন আউট হচ্ছে…",
      signOutEverywhere: "সব জায়গা থেকে সাইন আউট করুন",
      signOutFailed: "সাইন আউট ব্যর্থ হয়েছে: {message}",
      avatar: "অবতার"
    },
    appearance: {
      title: "অ্যাপিয়ারেন্স",
      description: "অ্যাপের থিম ও কালার পছন্দমতো সেট করুন।",
      mode: "মোড",
      colorMode: "কালার মোড",
      useMode: "{mode} মোড ব্যবহার করুন",
      active: "সক্রিয়",
      accentColor: "অ্যাকসেন্ট কালার",
      useTheme: "{name} থিম ব্যবহার করুন"
    },
    security: {
      title: "লগইন ও সিকিউরিটি",
      description: "আপনার পাসওয়ার্ড পরিবর্তন করুন এবং সেশন নিরাপদে রাখুন।"
    },
    browserNotifications: {
      title: "ব্রাউজার নোটিফিকেশন",
      description: "নতুন বার্তা এলে ব্রাউজারে নোটিফিকেশন পান।",
      toggleLabel: "নতুন বার্তা নোটিফিকেশন পান",
      toggleDesc: "ব্রাউজার ট্যাব খোলা থাকলে কাজ করবে।",
      statusGranted: "ব্রাউজার অনুমোদিত।",
      statusDefault: "চালু করলে ব্রাউজার অনুমতি চাইবে।",
      statusDenied: "ব্রাউজারে ব্লক করা আছে",
      deniedHint: "ব্রাউজার সেটিংস থেকে নোটিফিকেশন অ্যালাউ করুন।",
      unsupported: "আপনার ব্রাউজারে নোটিফিকেশন সাপোর্ট করে না।",
      sendTest: "টেস্ট নোটিফিকেশন পাঠান",
      testTitle: "টেস্ট নোটিফিকেশন",
      testBody: "নোটিফিকেশন সঠিকভাবে কাজ করছে।",
      permissionDeniedToast: "ব্রাউজার নোটিফিকেশন ব্লক করেছে",
      labels: {
        fallbackTitle: "নতুন বার্তা",
        image: "📷 ছবি",
        audio: "🎤 ভয়েস মেসেজ",
        video: "🎬 ভিডিও",
        document: "📄 ডকুমেন্ট",
        location: "📍 লোকেশন",
        template: "📋 টেমপ্লেট"
      }
    },
    apiKeys: {
      title: "এপিআই কি (API keys)",
      description: "পাবলিক এপিআই (<apiCode>/api/v1</apiCode>) ব্যবহারের জন্য এপিআই কি তৈরি করুন। header এ <headerCode>Authorization: Bearer &lt;key&gt;</headerCode> হিসেবে পাঠাবেন।",
      newApiKey: "নতুন এপিআই কি",
      noApiKeys: "এখনো কোনো এপিআই কি নেই।",
      createOneHint: "<bold>নতুন এপিআই কি</bold> বোতামে ক্লিক করে তৈরি করুন।",
      askAdminHint: "অ্যাডমিনকে এপিআই কি তৈরি করতে বলুন।",
      revoked: "বাতিলকৃত",
      expired: "মেয়াদোত্তীর্ণ",
      noScopes: "কোনো স্কোপ নেই",
      created: "তৈরির তারিখ {date}",
      lastUsed: "সর্বশেষ ব্যবহার {date}",
      neverUsed: "কখনো ব্যবহার করা হয়নি",
      expires: "মেয়াদের শেষ {date}",
      revoke: "বাতিল করুন",
      revokeSuccess: "\"{name}\" এপিআই কি বাতিল করা হয়েছে",
      revokeFailed: "এপিআই কি বাতিল করতে ব্যর্থ হয়েছে",
      loadFailed: "এপিআই কি লোড করতে ব্যর্থ হয়েছে",
      createError: "এপিআই কি তৈরি ব্যর্থ হয়েছে",
      nameRequired: "এপিআই কি-র একটি নাম দিন",
      nameLabel: "নাম",
      namePlaceholder: "যেমন: Zapier অটোমেশন",
      scopesLabel: "স্কোপসমূহ",
      scopesHint: "স্কোপ ছাড়া এপিআই কি কেবল <code>GET /api/v1/me</code> কল করতে পারে।",
      cancel: "বাতিল",
      creating: "তৈরি হচ্ছে…",
      createKey: "কি তৈরি করুন",
      copyTitle: "আপনার এপিআই কি কপি করুন",
      copyDesc: "এই কি-টি কেবল একবারই প্রদর্শিত হবে। এটি নিরাপদ স্থানে সংরক্ষণ করুন।",
      apiKeyLabel: "এপিআই কি",
      copy: "কপি করুন",
      copySuccess: "এপিআই কি কপি হয়েছে",
      copyFailed: "কপি করতে ব্যর্থ হয়েছে",
      newKeyTitle: "নতুন এপিআই কি",
      newKeyDesc: "আপনার ইন্টিগ্রেশনের নাম দিন এবং প্রয়োজনীয় স্কোপ দিন।",
      done: "সম্পন্ন",
      networkError: "সার্ভারে সংযোগ করা সম্ভব হয়নি"
    },
    deals: {
      title: "ডিল ও মুদ্রা",
      description: "নতুন ডিল এবং ড্যাশবোর্ডের জন্য ডিফল্ট কারেন্সি সেট করুন।",
      defaultCurrency: "ডিফল্ট কারেন্সি",
      defaultCurrencyDesc: "নতুন ডিল ও পাইপলাইনে এই কারেন্সি প্রদর্শিত হবে।",
      currencyLabel: "কারেন্সি",
      adminOnlyHint: "কেবলমাত্র অ্যাকাউন্ট অ্যাডমিন কারেন্সি পরিবর্তন করতে পারবেন।",
      save: "সংরক্ষণ করুন",
      saving: "সংরক্ষণ হচ্ছে...",
      saveFailed: "ডিফল্ট কারেন্সি সংরক্ষণ ব্যর্থ হয়েছে",
      saveSuccess: "ডিফল্ট কারেন্সি আপডেট হয়েছে"
    },
    aiConfig: {
      title: "এআই কনফিগারেশন",
      description: "আপনার OpenAI বা Anthropic এপিআই কি ব্যবহার করুন। ইনবক্স ড্রাফট ও অটো-রিপ্লাইয়ে এটি ব্যবহৃত হবে।",
      adminOnlyConfig: "কেবল অ্যাডমিন ও ওনার এআই কনফিগারেশন পরিবর্তন করতে পারবেন।",
      loadFailed: "এআই কনফিগারেশন লোড করতে ব্যর্থ হয়েছে",
      providerAndKey: "প্রোভাইডার ও কি (Key)",
      encryptionNotice: "আপনার কি সুরক্ষিতভাবে এনক্রিপ্ট (AES-256-GCM) থাকবে।",
      provider: "প্রোভাইডার",
      model: "মডেল",
      apiKey: "এপিআই কি (API key)",
      testKey: "কি পরীক্ষা করুন",
      testSuccess: "এপিআই কি কাজ করছে।",
      testRejected: "প্রোভাইডার অনুরোধ প্রত্যাখান করেছে।",
      testNetworkError: "প্রোভাইডারের সাথে সংযোগ করা যায়নি।",
      embeddingsKey: "এমবেডিংস কি (Embeddings key)",
      optionalSemanticSearch: "(ঐচ্ছিক — সিমান্টিক সার্চ সক্রিয় করে)",
      embeddingsHint: "নলেজ বেস সিমান্টিক সার্চের জন্য ব্যবহৃত হয়।",
      sameKeyText: " — উপরের কি-ই ব্যবহার করতে পারেন",
      behaviour: "আচরণ ও নির্দেশনা",
      behaviourDesc: "আপনার ব্যবসা, টোন ও সীমাবদ্ধতা সম্পর্কে বলুন।",
      businessContext: "ব্যবসায়িক বিবরণ ও নির্দেশনা",
      promptPlaceholder: "যেমন: আমরা কফি সরঞ্জাম বিক্রেতা। সুন্দর ও সংক্ষিপ্ত উত্তর দিন।",
      enableAssistant: "এআই অ্যাসিস্ট্যান্ট চালু করুন",
      enableAssistantDesc: "ইনবক্সে “Draft with AI” অপশন সক্রিয় করবে।",
      autoReply: "ইনবাউন্ড বার্তার অটো-রিপ্লাই",
      autoReplyDesc: "নতুন গ্রাহকের বার্তায় সরাসরি এআই উত্তর দেবে।",
      maxAutoReplies: "সর্বোচ্চ অটো-রিপ্লাই সংখ্যা",
      maxAutoRepliesDesc: "একই থ্রেডে নির্দিষ্ট সংখ্যার পর বট থামবে।",
      handoffTo: "মানুষের কাছে হস্তান্তর করুন",
      handoffToDesc: "বট সাহায্য করতে না পারলে বার্তা এখানে ট্রান্সফার করবে।",
      handoffQueue: "আনঅ্যাসাইন্ড কিউ (যেকোনো এজেন্ট দায়িত্ব নিতে পারবে)",
      remove: "সরিয়ে ফেলুন",
      save: "সংরক্ষণ করুন",
      missingModel: "মডেলের নাম দিন।",
      missingApiKey: "আপনার এপিআই কি দিন।",
      saveSuccess: "এআই অ্যাসিস্ট্যান্ট সংরক্ষিত হয়েছে।",
      saveFailed: "সংরক্ষণ করতে ব্যর্থ হয়েছে।",
      removeSuccess: "এআই কনফিগারেশন মুছে ফেলা হয়েছে।",
      removeFailed: "মুছে ফেলতে ব্যর্থ হয়েছে।",
      loading: "লোড হচ্ছে…"
    },
    aiKnowledge: {
      loadFailed: "নলেজ বেস লোড করতে ব্যর্থ হয়েছে",
      openFailed: "ডকুমেন্ট খুলতে ব্যর্থ হয়েছে",
      titleContentRequired: "শিরোনাম ও বিষয়বস্তু আবশ্যক।",
      saveSuccessNew: "ডকুমেন্ট যোগ করা হয়েছে।",
      saveSuccessUpdate: "ডকুমেন্ট আপডেট করা হয়েছে।",
      saveFailed: "সংরক্ষণ ব্যর্থ হয়েছে।",
      removeSuccess: "ডকুমেন্ট মুছে ফেলা হয়েছে।",
      removeFailed: "মুছে ফেলতে ব্যর্থ হয়েছে।",
      reindexSuccess: "{count} টি ডকুমেন্ট রি-ইনডেক্স হয়েছে।",
      reindexFailed: "রি-ইনডেক্স ব্যর্থ হয়েছে।",
      title: "নলেজ বেস",
      description: "FAQ, পলিসি বা পণ্য বিবরণ যোগ করুন। এআই উত্তর দেওয়ার সময় এটি ব্যবহার করবে।",
      semanticSearchOn: " সিমান্টিক সার্চ সক্রিয় আছে।",
      keywordSearchOn: " কিওয়ার্ড সার্চ ব্যবহৃত হচ্ছে।",
      noDocs: "এখনো কোনো ডকুমেন্ট নেই।",
      editDocTitle: "শিরোনাম",
      editDocTitlePlaceholder: "যেমন: রিফান্ড পলিসি",
      editDocContent: "বিষয়বস্তু",
      editDocContentPlaceholder: "FAQ এর উত্তর বা বিবরণ লিখুন…",
      cancel: "বাতিল",
      saveDoc: "ডকুমেন্ট সংরক্ষণ করুন",
      addDoc: "ডকুমেন্ট যোগ করুন",
      reindex: "রি-ইনডেক্স করুন",
      reindexTooltip: "সমস্ত ডকুমেন্ট পুনরায় ইনডেক্স করুন",
      editDoc: "সম্পাদনা",
      deleteDoc: "মুছে ফেলুন",
      loading: "লোড হচ্ছে…"
    },
    quickReplies: {
      title: "দ্রুত উত্তর (Quick replies)",
      description: "ইনবক্সে দ্রুত ব্যবহারের জন্য পূর্বসংরক্ষিত বার্তা।",
      newQuickReply: "নতুন দ্রুত উত্তর",
      noQuickReplies: "এখনো কোনো দ্রুত উত্তর নেই।",
      nameRequired: "দ্রুত উত্তরের নাম দিন।",
      saveFailed: "সংরক্ষণ ব্যর্থ হয়েছে।",
      saveSuccessUpdate: "আপডেট হয়েছে।",
      saveSuccessCreate: "তৈরি হয়েছে।",
      confirmDelete: "এটি মুছে ফেলতে চান?",
      deleteFailed: "মুছে ফেলতে ব্যর্থ হয়েছে।",
      editTitle: "সম্পাদনা করুন",
      newTitle: "নতুন তৈরি করুন",
      nameLabel: "নাম",
      namePlaceholder: "যেমন: অফিসের সময়সূচী",
      tabText: "টেক্সট",
      tabInteractive: "ইন্টারেক্টিভ",
      contentPlaceholder: "বার্তার বিষয়বস্তু লিখুন",
      cancel: "বাতিল",
      save: "সংরক্ষণ করুন"
    },
    members: {
      title: "টিম মেম্বারস",
      description: "আপনার অ্যাকাউন্টে টিম সদস্যদের পরিচালনা করুন।",
      inviteMember: "মেম্বারদের আমন্ত্রণ জানান",
      searchPlaceholder: "মেম্বার খুঁজুন…",
      roleFilterAll: "সকল ভূমিকা",
      memberRoster: "মেম্বার তালিকা ({count})",
      pendingInvitations: "অপেক্ষমাণ আমন্ত্রণ ({count})",
      noMembersYet: "এখনো কোনো মেম্বার নেই।",
      noInvitationsYet: "কোনো অপেক্ষমাণ আমন্ত্রণ নেই।",
      unnamed: "নামহীন মেম্বার",
      ownerBadge: "ওনার (Owner)",
      selfBadge: "আপনি",
      resendInvite: "আমন্ত্রণ পুনরায় পাঠান",
      revokeInvite: "আমন্ত্রণ বাতিল করুন",
      removeMember: "মেম্বার মুছে ফেলুন",
      changeRole: "ভূমিকা পরিবর্তন করুন",
      confirmRemoveTitle: "মেম্বারকে সরিয়ে দেবেন?",
      confirmRemoveDesc: "{name} আর এই অ্যাকাউন্টে অ্যাক্সেস পাবেন না।",
      confirmRevokeTitle: "আমন্ত্রণ বাতিল করবেন?",
      confirmRevokeDesc: "এই আমন্ত্রণ লিংকটি আর কাজ করবে না।",
      loadFailed: "মেম্বারদের লোড করতে ব্যর্থ হয়েছে",
      loadInvitationsFailed: "আমন্ত্রণ তালিকা লোড করতে ব্যর্থ হয়েছে",
      networkError: "সার্ভারে সংযোগ করতে ব্যর্থ হয়েছে",
      updateRoleFailed: "ভূমিকা পরিবর্তন ব্যর্থ হয়েছে",
      updatedToast: "{name}-এর ভূমিকা {role} হিসেবে আপডেট হয়েছে",
      removeFailed: "মেম্বার অপসারণ ব্যর্থ হয়েছে",
      removedToast: "{name}-কে টিম থেকে সরিয়ে দেওয়া হয়েছে",
      revokeFailed: "আমন্ত্রণ বাতিল ব্যর্থ হয়েছে",
      revokedToast: "আমন্ত্রণ বাতিল করা হয়েছে"
    },
    invite: {
      inviteCreated: "আমন্ত্রণ তৈরি হয়েছে",
      inviteCreatedDesc: "নতুন সতীর্থের সাথে এই লিংকটি শেয়ার করুন। তারা লিংক থেকে সাইন আপ বা সাইন ইন করে <bold>{role}</bold> হিসেবে যোগ দিতে পারবেন। লিংকের মেয়াদ <bold>{days} দিন</bold>।",
      inviteLink: "আমন্ত্রণ লিংক",
      copy: "কপি করুন",
      saveLinkNow: "লিংকটি সংরক্ষণ করুন।",
      saveLinkHint: "ডায়ালগ বন্ধ করলে লিংকটি আর দেখা যাবে না।",
      sendViaWhatsApp: "হোয়াটসঅ্যাপে পাঠান",
      done: "সম্পন্ন",
      dialogTitle: "সতীর্থকে আমন্ত্রণ জানান",
      networkError: "সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।",
      fallbackAccountName: "আমাদের wacrm অ্যাকাউন্ট",
      dialogDesc: "এককালীন আমন্ত্রণ লিংক তৈরি করুন এবং শেয়ার করুন।",
      roleLabel: "ভূমিকা",
      validForLabel: "লিংকের সময়সীমা",
      days1: "১ দিন",
      days7: "৭ দিন",
      days30: "৩০ দিন",
      labelTitle: "লেবেল",
      optional: "(ঐচ্ছিক)",
      labelPlaceholder: "যেমন: রাফিদ — সাপোর্ট টিম",
      labelHint: "কাকে লিংকটি পাঠিয়েছেন তা মনে রাখতে সাহায্য করে।",
      cancel: "বাতিল",
      creating: "তৈরি হচ্ছে...",
      generateLink: "লিংক তৈরি করুন",
      labelTooLong: "লেবেল সর্বোচ্চ {max} অক্ষরের হতে হবে",
      copied: "লিংক কপি করা হয়েছে",
      clipboardBlocked: "ক্লিপবোর্ড ব্লকড — ম্যানুয়ালি লিংক কপি করুন",
      whatsappMessage: "এই লিংকের মাধ্যমে আমাদের সাথে যোগ দিন: {url}",
      createFailed: "আমন্ত্রণ তৈরি ব্যর্থ হয়েছে"
    },
    roles: {
      owner: "ওনার (Owner)",
      admin: "অ্যাডমিন (Admin)",
      agent: "এজেন্ট (Agent)",
      viewer: "দর্শক (Viewer)"
    },
    tagsAndFields: {
      title: "ফিল্ড ও ট্যাগ",
      description: "কন্টাক্ট ট্যাগ এবং কাস্টম ফিল্ড পরিচালনা করুন।",
      fieldsTitle: "কাস্টম ফিল্ডস",
      adminRole: "অ্যাডমিন",
      fieldsDesc: "কন্টাক্টদের তথ্য সংরক্ষণের জন্য অতিরিক্ত কাস্টম ফিল্ড তৈরি করুন।"
    },
    templates: {
      title: "মেসেজ টেমপ্লেট",
      description: "মেটা অনুমোদিত হোয়াটসঅ্যাপ মেসেজ টেমপ্লেট পরিচালনা করুন।",
      createTemplate: "নতুন টেমপ্লেট",
      syncTemplates: "টেমপ্লেট সিঙ্ক করুন"
    },
    whatsapp: {
      title: "হোয়াটসঅ্যাপ কনফিগারেশন",
      description: "আপনার হোয়াটসঅ্যাপ ক্লাউড এপিআই বা বিজনেস অ্যাকাউন্ট যুক্ত করুন।"
    }
  },
  SignupPage: {
    passwordsMismatch: "পাসওয়ার্ড দুটি মেলেনি",
    passwordTooShort: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে",
    checkEmailTitle: "আপনার ইমেইল চেক করুন",
    checkEmailDesc: "আমরা <strong>{email}</strong> ঠিকানায় একটি নিশ্চিতকরণ লিংক পাঠিয়েছি। অনুগ্রহ করে ইমেইল পরীক্ষা করে অ্যাকাউন্ট ভেরিফাই করুন।",
    backToSignIn: "সাইন ইন পেজে ফিরে যান",
    titleJoin: "অ্যাকাউন্ট তৈরি করুন ও যোগ দিন",
    title: "অ্যাকাউন্ট তৈরি করুন",
    descJoin: "ইমেইল ভেরিফাই করুন, তারপর টিমে যোগ দেওয়ার আমন্ত্রণ গ্রহণ করুন।",
    desc: "হোয়াটসঅ্যাপ সিআরএম-এর সাথে সূচনা করুন",
    fullNameLabel: "পুরো নাম",
    fullNamePlaceholder: "John Doe",
    emailLabel: "ইমেইল ঠিকানা",
    emailPlaceholder: "you@example.com",
    passwordLabel: "পাসওয়ার্ড",
    passwordPlaceholder: "কমপক্ষে ৬ অক্ষর",
    confirmPasswordLabel: "পাসওয়ার্ড নিশ্চিত করুন",
    confirmPasswordPlaceholder: "পাসওয়ার্ড পুনরায় লিখুন",
    creating: "অ্যাকাউন্ট তৈরি হচ্ছে...",
    submit: "রেজিস্ট্রেশন করুন",
    haveAccount: "ইতিমধ্যে অ্যাকাউন্ট আছে?",
    signIn: "সাইন ইন করুন"
  },
  ForgotPasswordPage: {
    checkEmailTitle: "আপনার ইমেইল চেক করুন",
    checkEmailDesc: "আমরা <strong>{email}</strong> ঠিকানায় একটি পাসওয়ার্ড রিসেট লিংক পাঠিয়েছি। অনুগ্রহ করে ইমেইল ইনবক্স চেক করুন।",
    backToSignIn: "সাইন ইন পেজে ফিরে যান",
    title: "পাসওয়ার্ড ভুলে গেছেন?",
    desc: "আপনার ইমেইল ঠিকানা দিন, আমরা রিসেট লিংক পাঠিয়ে দেব।",
    emailLabel: "ইমেইল ঠিকানা",
    emailPlaceholder: "you@example.com",
    sending: "পাঠানো হচ্ছে...",
    sendLink: "রিট সেট লিংক পাঠান"
  },
  ResetPasswordPage: {
    title: "নতুন পাসওয়ার্ড নির্ধারণ করুন",
    desc: "আপনার অ্যাকাউন্টের জন্য একটি নতুন পাসওয়ার্ড প্রদান করুন।",
    passwordLabel: "নতুন পাসওয়ার্ড",
    passwordPlaceholder: "কমপক্ষে ৬ অক্ষর",
    confirmPasswordLabel: "নতুন পাসওয়ার্ড নিশ্চিত করুন",
    confirmPasswordPlaceholder: "পাসওয়ার্ড পুনরায় লিখুন",
    submit: "পাসওয়ার্ড আপডেট করুন",
    saving: "আপডেট হচ্ছে...",
    passwordsMismatch: "পাসওয়ার্ড দুটি মেলেনি",
    passwordTooShort: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে",
    checking: "লিংক পরীক্ষা করা হচ্ছে...",
    expiredTitle: "এই লিংকের মেয়াদ শেষ হয়েছে",
    expiredDesc: "পাসওয়ার্ড রিসেট লিংক কেবল একবার ব্যবহারযোগ্য এবং অল্প সময়ের পর মেয়াদ শেষ হয়। নতুন একটি লিংকের আবেদন করুন।",
    requestNewLink: "নতুন লিংকের জন্য অনুরোধ করুন",
    backToSignIn: "সাইন ইন পেজে ফিরে যান",
    successTitle: "পাসওয়ার্ড সফলভাবে আপডেট হয়েছে",
    successDesc: "আপনি আপনার নতুন পাসওয়ার্ড দিয়ে সাইন ইন করেছেন।",
    continueToDashboard: "ড্যাশবোর্ডে এগিয়ে যান"
  },
  JoinPage: {
    fail: {
      notFoundTitle: "আমন্ত্রণ পাওয়া যায়নি",
      notFoundBody: "এই লিংকটি কোনো সঠিক আমন্ত্রণের সাথে মিলছে না। ইউআরএল আবার পরীক্ষা করুন অথবা যিনি আমন্ত্রণ জানিয়েছেন তাকে নতুন লিংক পাঠাতে বলুন।",
      usedTitle: "আমন্ত্রণটি ইতিমধ্যে ব্যবহৃত হয়েছে",
      usedBody: "এই আমন্ত্রণটি ইতিমধ্যে গ্রহণ করা হয়েছে। যদি আপনি না হয়ে থাকেন, তবে অ্যাডমিনকে নতুন একটি লিংক পাঠাতে বলুন।",
      expiredTitle: "আমন্ত্রণের মেয়াদ শেষ",
      expiredBody: "এই আমন্ত্রণের সময়সীমা শেষ হয়ে গেছে। অ্যাকাউন্ট অ্যাডমিনকে নতুন লিংক পাঠাতে বলুন।"
    },
    conflictDefault: "আপনি ইতিমধ্যে অন্য একটি অ্যাকাউন্টে রয়েছেন। এই অ্যাকাউন্টে যোগ দিতে অন্য ইমেইল দিয়ে সাইন ইন করুন।",
    acceptFailed: "আমন্ত্রণ গ্রহণ করতে ব্যর্থ হয়েছে",
    welcome: "টিমে স্বাগতম",
    serverUnreachable: "সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি",
    signOutFailed: "সাইন আউট করা সম্ভব হয়নি। পেজটি রিফ্রেশ করুন।",
    verifying: "আমন্ত্রণ যাচাই করা হচ্ছে…",
    tryAgain: "আবার চেষ্টা করুন",
    createNewAccount: "নতুন অ্যাকাউন্ট তৈরি করুন",
    signIn: "সাইন ইন করুন",
    invitedTo: "আপনাকে <account>{name}</account>-এ আমন্ত্রণ জানানো হয়েছে",
    joinAs: "আপনি <badge>{role}</badge> হিসেবে যোগ দেবেন। লিংকের মেয়াদ {date} পর্যন্ত।",
    accepting: "গ্রহণ করা হচ্ছে…",
    acceptInvitation: "আমন্ত্রণ গ্রহণ করুন",
    acceptNote: "গ্রহণ করলে আপনার অ্যাকাউন্টটি {name}-এ যুক্ত হবে। রেজিস্ট্রেশনের সময় গঠিত ব্যক্তিগত অ্যাকাউন্টটি মুছে ফেলা হবে।",
    conflictTitle: "এই অ্যাকাউন্ট দিয়ে {name}-এ যোগ দেওয়া যাবে না",
    conflictBody: "<account>{name}</account>-এ যোগ দিতে সাইন আউট করুন এবং অন্য ইমেইল দিয়ে সাইন আপ করুন। মেয়াদ না শেষ হওয়া পর্যন্ত লিংকটি কার্যকর থাকবে।",
    staySignedIn: "সাইন ইন অবস্থায় থাকুন",
    signingOut: "সাইন আউট হচ্ছে…",
    signOutSwitch: "সাইন আউট করুন এবং অন্য ইমেইল ব্যবহার করুন",
    createAndJoin: "অ্যাবাউন্ট তৈরি করুন ও যোগ দিন",
    haveAccount: "আমার ইতিমধ্যে একটি অ্যাকাউন্ট আছে"
  },
  Notifications: {
    title: "নোটিফিকেশন",
    description: "টিমের সহকর্মীরা আপনার নামে কোনো কনভার্সেশন অ্যাসাইন করলে তা এখানে দেখতে পাবেন।",
    markAllRead: "সব পঠিত চিহ্নিত করুন",
    markReadFailed: "পঠিত চিহ্নিত করতে ব্যর্থ হয়েছে",
    markAllFailed: "সবগুলো পঠিত চিহ্নিত করতে ব্যর্থ হয়েছে",
    retry: "আবার চেষ্টা করুন",
    emptyTitle: "এখনো কোনো নোটিফিকেশন নেই",
    emptyDesc: "কেউ আপনাকে কোনো কনভার্সেশন অ্যাসাইন করলে এখানে সতর্কবার্তা দেখতে পাবেন।",
    unread: "অপঠিত"
  },
  Agents: {
    title: "এআই এজেন্টস",
    description: "আপনার নিজস্ব এআই এজেন্ট সেটআপ করুন এবং গ্রাহকদের স্বয়ংক্রিয় উত্তর দেওয়ার আগে প্লেগ্রাউন্ডে পরীক্ষা করে নিন।",
    tabPlayground: "প্লেগ্রাউন্ড",
    tabSetup: "সেটআপ",
    tabUsage: "ব্যবহার",
    playground: {
      title: "প্লেগ্রাউন্ড",
      subtitle: "— গ্রাহক হিসেবে বার্তা পাঠিয়ে পরীক্ষা করুন",
      reset: "রিসেট",
      emptyTitle: "এআই এজেন্ট কীভাবে উত্তর দেয় তা দেখতে বার্তা পাঠান।",
      emptyDesc: "এটি আপনার নলেজ বেস ব্যবহার করে এবং অটো-রিপ্লাই বটের মতোই কাজ করে।",
      goToSetup: "সেটআপ সম্পন্ন করেননি? সেটআপে যান",
      handoff: "এখানে মানুষের কাছে হস্তান্তর করা হবে",
      thinking: "ভাবছে…",
      placeholder: "গ্রাহকের মতো বার্তা লিখুন…",
      notConfigured: "এখনো এজেন্ট কনফিগার করা হয়নি — আগে সেটআপ শেষ করুন।",
      noReply: "কোনো উত্তর পাওয়া যায়নি।",
      unreachable: "এজেন্টের সাথে যোগাযোগ করা যাচ্ছে না।"
    },
    usage: {
      title: "টোকেন ব্যবহার",
      description: "ড্রাফট এবং অটো-রিপ্লাই বটের মাধ্যমে ব্যবহৃত টোকেন সংখ্যা। কেবল সংখ্যা সংরক্ষিত হয় — কোনো বার্তা বিষয়বস্তু সংরক্ষিত হয় না।",
      window: "গত {days} দিন",
      loadFailed: "ব্যবহারের তথ্য লোড করতে ব্যর্থ হয়েছে",
      empty: "গত {days} দিনে কোনো এআই ব্যবহার হয়নি।",
      emptyHint: "অ্যাসিস্ট্যান্ট ড্রাফট ও অটো-রিপ্লাই দেওয়ার সাথে সাথে এটি পূর্ণ হবে।",
      totalTokens: "মোট টোকেন",
      llmCalls: "এলএলএম কলস",
      autoReply: "অটো-রিপ্লাই",
      drafts: "ড্রাফটস",
      tokens: "টোকেনস",
      tokensPerDay: "প্রতিদিনের টোকেন",
      byModel: "মডেল অনুযায়ী",
      modelCalls: "{tokens} টোকেন · {count, plural, =1 {# কল} other {# কল}}",
      partialWindow: "আংশিক সময়সীমা দেখানো হচ্ছে — ব্যবহার অত্যাধিক হওয়ায় কেবল সাম্প্রতিক তথ্য সংক্ষেপিত হয়েছে।"
    }
  },
  Interactive: {
    replyButtons: "উত্তর বোতাম",
    list: "তালিকা",
    body: "মূল বার্তা",
    bodyPlaceholder: "বিকল্পগুলোর উপরে গ্রাহক যা দেখতে পাবেন",
    header: "হেডার (ঐচ্ছিক)",
    footer: "ফুটার (ঐচ্ছিক)",
    showIds: "রিপ্লাই আইডি দেখান (উন্নত)",
    preview: "প্রিভিউ",
    previewBody: "বার্তার মূল অংশ…",
    previewButton: "বোতাম",
    previewMenu: "মেনু",
    buttonsCount: "বোতাম ({count}/{max})",
    idPlaceholder: "আইডি",
    buttonLabelPlaceholder: "বোতামের লেবেল",
    addButton: "বোতাম যোগ করুন",
    listButtonLabel: "তালিকা বোতাম লেবেল",
    rowsCount: "সারি ({count}/{max})",
    sectionTitlePlaceholder: "সেকশন শিরোনাম (ঐচ্ছিক)",
    rowTitlePlaceholder: "সারির শিরোনাম",
    rowDescriptionPlaceholder: "বিবরণ (ঐচ্ছিক)",
    addRow: "সারি যোগ করুন",
    addSection: "সেকশন যোগ করুন"
  },
  DashboardShell: {
    loading: "লোড হচ্ছে..."
  }
}

// Deep-diff: returns only keys present in source but missing/different in target
function findMissingKeys(source, target, path = '') {
  const missing = {}
  for (const [key, value] of Object.entries(source)) {
    const fullPath = path ? `${path}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = findMissingKeys(value, target?.[key] ?? {}, fullPath)
      if (Object.keys(nested).length > 0) missing[key] = nested
    } else {
      // Translate if missing OR if English source matches target (never translated)
      if (target?.[key] === undefined || target?.[key] === value) {
        missing[key] = value
      }
    }
  }
  return missing
}

// Deep-merge: source wins only for keys that exist in source
function deepMerge(existing, fresh) {
  const result = { ...existing }
  for (const [key, value] of Object.entries(fresh)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = deepMerge(existing?.[key] ?? {}, value)
    } else {
      result[key] = value
    }
  }
  return result
}

// Helper to get nested value from object
function getNested(obj, pathArr) {
  let curr = obj
  for (const p of pathArr) {
    if (curr && typeof curr === 'object') curr = curr[p]
    else return undefined
  }
  return curr
}

// Translate a flat object of { key: englishString } using Gemini AI or high quality translation
async function translateBatch(ai, entries, targetLang, pathArr = []) {
  if (Object.keys(entries).length === 0) return {}

  if (ai) {
    const prompt = `You are a professional translator for a business web app called JobabDesk.
Translate these UI strings from English to ${targetLang}.

Rules:
- Keep {variables} like {count}, {suffix}, {name} exactly as-is
- Keep ICU plural format like {count, plural, =1 {deal} other {deals}} but translate "deal"/"deals"
- Keep HTML tags if any
- Return ONLY valid JSON, no explanation, no markdown code block
- Be concise — these are UI labels, buttons, and short descriptions
- Use simple, natural language that business owners in Bangladesh would understand

Input JSON:
${JSON.stringify(entries, null, 2)}

Output: translated JSON with same keys`

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']
    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: 0.1 },
        })

        let text = response.text?.trim() ?? ''
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
        return JSON.parse(text)
      } catch (_e) {
        // Try next model or fallback
      }
    }
  }

  // Fallback translation lookup from embedded dictionary
  const translated = {}
  for (const [key, val] of Object.entries(entries)) {
    const fallbackVal = getNested(FALLBACK_BN_DICTIONARY, [...pathArr, key])
    translated[key] = fallbackVal ?? val
  }
  return translated
}

// Recursively translate a nested missing-keys object
async function translateNested(ai, missingObj, targetLang, depth = 0, currentPath = []) {
  const result = {}
  const flatEntries = {}
  const nestedKeys = []

  for (const [key, value] of Object.entries(missingObj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      nestedKeys.push(key)
    } else {
      flatEntries[key] = value
    }
  }

  // Translate flat strings in one batch
  if (Object.keys(flatEntries).length > 0) {
    console.log(`  ${'  '.repeat(depth)}Translating ${Object.keys(flatEntries).length} strings...`)
    const translated = await translateBatch(ai, flatEntries, targetLang, currentPath)
    Object.assign(result, translated)
  }

  // Recurse into nested objects
  for (const key of nestedKeys) {
    console.log(`  ${'  '.repeat(depth)}[${key}]`)
    result[key] = await translateNested(ai, missingObj[key], targetLang, depth + 1, [...currentPath, key])
  }

  return result
}

async function main() {
  let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    try {
      const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8')
      const match = envContent.match(/^GEMINI_API_KEY=(.+)$/m)
      if (match && match[1].trim()) {
        apiKey = match[1].trim()
      }
    } catch (_e) {
      // .env.local not found
    }
  }

  let ai = null
  if (apiKey && !apiKey.startsWith('AQ.')) {
    try {
      ai = new GoogleGenAI({ apiKey })
    } catch (_e) {
      ai = null
    }
  }

  const enPath = resolve(ROOT, 'messages/en.json')
  const en = JSON.parse(readFileSync(enPath, 'utf-8'))

  for (const [locale, langDesc] of Object.entries(TARGET_LOCALES)) {
    const outPath = resolve(ROOT, `messages/${locale}.json`)
    let existing = {}
    try {
      existing = JSON.parse(readFileSync(outPath, 'utf-8'))
    } catch {
      console.log(`  Creating new ${locale}.json`)
    }

    console.log(`\n🌐 Translating → ${locale} (${langDesc.split('—')[0].trim()})`)
    const missing = findMissingKeys(en, existing)
    const missingCount = JSON.stringify(missing).length

    if (missingCount < 5) {
      console.log('  ✅ Already up to date — nothing to translate')
      continue
    }

    console.log(`  Found missing/untranslated keys, translating...`)
    const translated = await translateNested(ai, missing, langDesc)
    const merged = deepMerge(existing, translated)

    writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    console.log(`  ✅ Saved messages/${locale}.json`)
  }

  console.log('\n✅ Translation complete!')
}

main().catch(err => { console.error(err); process.exit(1) })
