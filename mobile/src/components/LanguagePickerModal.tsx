import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { fonts } from '../theme/typography'
import {
  DRIVEMIND_LANGUAGES,
  type Language,
} from '../store/languageStore'

const SHEET_BG = '#121214'
const INPUT_BG = '#1E1E22'
const BORDER = '#27272A'
const TEXT_PRIMARY = '#FAFAFA'
const TEXT_MUTED = '#A1A1AA'
const PLACEHOLDER = '#666666'
const ACCENT = '#22C55E'

/** Native endonym — always shown in the picker regardless of active locale. */
const LANGUAGE_NATIVE_LABELS: Record<Language, string> = {
  en: 'English',
  pl: 'Polski',
  uk: 'Українська',
  ru: 'Русский',
}

type LanguagePickerModalProps = {
  visible: boolean
  activeLanguage: Language
  onClose: () => void
  onSelect: (language: Language) => void
}

type LanguageRow = {
  code: Language
  label: string
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function LanguagePickerModal({
  visible,
  activeLanguage,
  onClose,
  onSelect,
}: LanguagePickerModalProps) {
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState('')

  const allLanguages = useMemo<LanguageRow[]>(
    () =>
      DRIVEMIND_LANGUAGES.map((code) => ({
        code,
        label: LANGUAGE_NATIVE_LABELS[code],
      })),
    [],
  )

  const filteredLanguages = useMemo(() => {
    const q = normalizeSearch(searchQuery)
    if (!q) return allLanguages
    return allLanguages.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q),
    )
  }, [allLanguages, searchQuery])

  const handleClose = useCallback(() => {
    setSearchQuery('')
    onClose()
  }, [onClose])

  const handleSelect = useCallback(
    (code: Language) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onSelect(code)
      setSearchQuery('')
      onClose()
    },
    [onClose, onSelect],
  )

  const renderItem = useCallback(
    ({ item }: { item: LanguageRow }) => {
      const selected = item.code === activeLanguage
      return (
        <TouchableOpacity
          style={[styles.row, selected && styles.rowSelected]}
          activeOpacity={0.7}
          onPress={() => handleSelect(item.code)}
        >
          <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
            {item.label}
          </Text>
          {selected ? (
            <Feather name="check" size={18} color={ACCENT} />
          ) : (
            <View style={styles.checkPlaceholder} />
          )}
        </TouchableOpacity>
      )
    },
    [activeLanguage, handleSelect],
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={styles.headerTitle}>Wybierz język / Choose language</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={22} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Feather name="search" size={16} color={PLACEHOLDER} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Szukaj / Search..."
                placeholderTextColor={PLACEHOLDER}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
            </View>

            <FlatList
              data={filteredLanguages}
              keyExtractor={(item) => item.code}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No languages match your search.</Text>
              }
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  keyboardAvoid: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: BORDER,
    maxHeight: '78%',
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    paddingRight: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INPUT_BG,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_PRIMARY,
    paddingVertical: 0,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowSelected: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  rowLabel: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_PRIMARY,
  },
  rowLabelSelected: {
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: ACCENT,
  },
  checkPlaceholder: {
    width: 18,
    height: 18,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
    paddingVertical: 24,
  },
})
