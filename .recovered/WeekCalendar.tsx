/**
 * Lightweight horizontal month calendar for the last 30 days.
 * No external dependencies — built with ScrollView + React Native primitives.
 * Renders one row of day cells. The user scrolls horizontally across the month.
 */
import React, { useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { fonts } from '../theme/typography'
import { useColors } from '../theme/theme'

const DAY_CELL_W = 44
const DAY_CELL_GAP = 6

/** Returns midnight local date for a given ms timestamp */
export function toLocalMidnight(ms: number): Date {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** "2 Jun" */
function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "Mon" */
function formatWeekday(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}

interface WeekCalendarProps {
  /** Currently selected day (midnight local). Null = no selection. */
  selectedDate: Date | null
  /** Days that have at least one order — highlighted with a dot. */
  activeDates: Date[]
  onSelectDate: (day: Date | null) => void
}

export function WeekCalendar({ selectedDate, activeDates, onSelectDate }: WeekCalendarProps) {
  const c = useColors()
  const scrollRef = useRef<ScrollView>(null)

  const today = toLocalMidnight(Date.now())

  // Build last 30 days, newest first → render oldest-first left to right
  const days: Date[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(d)
  }

  // Scroll to end (today) on mount
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false })
    }, 80)
  }, [])

  const isActive = useCallback(
    (day: Date) => activeDates.some((ad) => isSameDay(ad, day)),
    [activeDates],
  )

  return (
    <View style={st.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.row}
      >
        {days.map((day) => {
          const isToday = isSameDay(day, today)
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
          const hasOrders = isActive(day)

          return (
            <TouchableOpacity
              key={day.toISOString()}
              activeOpacity={0.7}
              onPress={() => onSelectDate(isSelected ? null : day)}
              style={[
                st.cell,
                {
                  backgroundColor: isSelected
                    ? c.primary
                    : isToday
                    ? c.primaryDim
                    : c.surface,
                  borderColor: isSelected
                    ? c.primary
                    : isToday
                    ? c.primary
                    : c.border,
                },
              ]}
            >
              <Text
                style={[
                  st.weekday,
                  { color: isSelected ? c.textInverse : c.textMuted },
                ]}
              >
                {formatWeekday(day)}
              </Text>
              <Text
                style={[
                  st.dayNum,
                  {
                    color: isSelected
                      ? c.textInverse
                      : isToday
                      ? c.primary
                      : c.text,
                  },
                ]}
              >
                {day.getDate()}
              </Text>
              <View
                style={[
                  st.dot,
                  {
                    backgroundColor: hasOrders
                      ? isSelected
                        ? c.textInverse
                        : c.success
                      : 'transparent',
                  },
                ]}
              />
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      {selectedDate && (
        <View style={st.selectedLabel}>
          <Text style={[st.selectedLabelText, { color: c.textMuted }]}>
            {formatDayLabel(selectedDate)}
          </Text>
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  wrapper: {
    marginBottom: 4,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: DAY_CELL_GAP,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    width: DAY_CELL_W,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  weekday: {
    fontSize: 9,
    fontFamily: fonts.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dayNum: {
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  selectedLabel: {
    paddingHorizontal: 20,
    paddingBottom: 2,
  },
  selectedLabelText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    letterSpacing: 0.5,
  },
})
