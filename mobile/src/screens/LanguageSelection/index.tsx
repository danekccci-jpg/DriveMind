import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import i18n from '../../i18n'
import { useColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'
import { useLanguageStore, type Language } from '../../store/languageStore'

export default function LanguageSelectionScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const c = useColors()
  const confirmLanguageChoice = useLanguageStore((s) => s.confirmLanguageChoice)

  const applyLanguage = (lang: Language) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    confirmLanguageChoice(lang)
    i18n.changeLanguage(lang)
  }

  return (
    <View style={[s.root, { backgroundColor: c.bg, paddingTop: insets.top + 20 }]}>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>{t('choose_language')}</Text>
        <Text style={[s.subtitle, { color: c.textSecondary }]}>{t('choose_language_subtitle')}</Text>
        <View style={s.langGrid}>
          <TouchableOpacity style={[s.button, { borderColor: c.primary }]} activeOpacity={0.7} onPress={() => applyLanguage('en')}>
            <Text style={[s.buttonText, { color: c.text }]}>English</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.button, { borderColor: c.primary }]} activeOpacity={0.7} onPress={() => applyLanguage('pl')}>
            <Text style={[s.buttonText, { color: c.text }]}>Polski</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.button, { borderColor: c.primary }]} activeOpacity={0.7} onPress={() => applyLanguage('uk')}>
            <Text style={[s.buttonText, { color: c.text }]}>Українська</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.button, { borderColor: c.primary }]} activeOpacity={0.7} onPress={() => applyLanguage('ru')}>
            <Text style={[s.buttonText, { color: c.text }]}>Русский</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 24, fontFamily: fonts.semiBold, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', marginBottom: 12 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  button: { width: '48%', height: 52, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontFamily: fonts.medium },
})
