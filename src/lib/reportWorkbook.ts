import type {
  Branch,
  DstvSubscription,
  FuelRefill,
  PowerSession,
  Repair,
  Service,
  YakaPurchase,
} from '../types/database'
import { exportToXlsx, type ExcelCellValue, type ExcelSheet } from './export'
import { formatDate, formatDateTime, startOfMonth, startOfWeek, toLocalDateInput } from './utils'

export type ReportPeriod = 'weekly' | 'monthly'

export interface BranchReportData {
  branch: Pick<Branch, 'id' | 'name' | 'region'>
  sessions: PowerSession[]
  refills: FuelRefill[]
  services: Service[]
  repairs: Repair[]
  subscriptions: DstvSubscription[]
  purchases: YakaPurchase[]
}

export interface AdminReportData {
  branches: Branch[]
  sessions: PowerSession[]
  refills: FuelRefill[]
  services: Service[]
  repairs: Repair[]
  subscriptions: DstvSubscription[]
  purchases: YakaPurchase[]
}

interface PeriodRange {
  label: string
  start: Date
  end: Date
}

interface BranchPeriodRows {
  sessions: PowerSession[]
  refills: FuelRefill[]
  services: Service[]
  repairs: Repair[]
  subscriptions: DstvSubscription[]
  purchases: YakaPurchase[]
}

interface BranchTotals {
  outages: number
  generatorMinutes: number
  fuelRefills: number
  fuelLitres: number
  fuelCost: number
  serviceRecords: number
  serviceCost: number
  repairRecords: number
  repairCost: number
  dstvRecords: number
  dstvCost: number
  yakaRecords: number
  yakaUnits: number
  yakaCost: number
  totalCost: number
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function nextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function localDate(date: string) {
  return new Date(`${date}T00:00:00`)
}

function periodRange(period: ReportPeriod): PeriodRange {
  const start = period === 'weekly' ? startOfWeek() : startOfMonth()
  const end = period === 'weekly' ? addDays(start, 7) : nextMonth(start)
  const label =
    period === 'weekly'
      ? `Weekly report (${formatDate(start)} - ${formatDate(addDays(end, -1))})`
      : `Monthly report (${start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })})`

  return { label, start, end }
}

function inRange(date: Date, range: PeriodRange) {
  return date >= range.start && date < range.end
}

function numberValue(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function serviceDetailText(row: Service) {
  return [row.items_replaced, row.repairs_done].filter(Boolean).join(' / ')
}

function effectiveEnd(session: PowerSession, range: PeriodRange) {
  const now = new Date()
  const end = session.ended_at ? new Date(session.ended_at) : now
  return end > range.end ? range.end : end
}

function sessionMinutes(session: PowerSession, range: PeriodRange) {
  const start = new Date(session.started_at)
  const end = effectiveEnd(session, range)
  const overlapStart = Math.max(start.getTime(), range.start.getTime())
  const overlapEnd = Math.min(end.getTime(), range.end.getTime())
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 60000))
}

function sessionTouchesRange(session: PowerSession, range: PeriodRange) {
  const start = new Date(session.started_at)
  const end = effectiveEnd(session, range)
  return start < range.end && end > range.start
}

function filterBranchRows(data: BranchReportData, range: PeriodRange): BranchPeriodRows {
  return {
    sessions: data.sessions.filter((session) => sessionTouchesRange(session, range)),
    refills: data.refills.filter((row) => inRange(localDate(row.refill_date), range)),
    services: data.services.filter((row) => inRange(localDate(row.service_date), range)),
    repairs: data.repairs.filter((row) => inRange(localDate(row.repair_date), range)),
    subscriptions: data.subscriptions.filter((row) => inRange(localDate(row.subscription_date), range)),
    purchases: data.purchases.filter((row) => inRange(localDate(row.purchase_date), range)),
  }
}

function calculateTotals(rows: BranchPeriodRows, range: PeriodRange): BranchTotals {
  const fuelCost = rows.refills.reduce((sum, row) => sum + numberValue(row.cost), 0)
  const serviceCost = rows.services.reduce((sum, row) => sum + numberValue(row.cost), 0)
  const repairCost = rows.repairs.reduce((sum, row) => sum + numberValue(row.cost), 0)
  const dstvCost = rows.subscriptions.reduce((sum, row) => sum + numberValue(row.amount), 0)
  const yakaCost = rows.purchases.reduce((sum, row) => sum + numberValue(row.amount), 0)

  return {
    outages: rows.sessions.filter((session) => inRange(new Date(session.started_at), range)).length,
    generatorMinutes: rows.sessions.reduce((sum, session) => sum + sessionMinutes(session, range), 0),
    fuelRefills: rows.refills.length,
    fuelLitres: rows.refills.reduce((sum, row) => sum + numberValue(row.litres), 0),
    fuelCost,
    serviceRecords: rows.services.length,
    serviceCost,
    repairRecords: rows.repairs.length,
    repairCost,
    dstvRecords: rows.subscriptions.length,
    dstvCost,
    yakaRecords: rows.purchases.length,
    yakaUnits: rows.purchases.reduce((sum, row) => sum + numberValue(row.units), 0),
    yakaCost,
    totalCost: fuelCost + serviceCost + repairCost + dstvCost + yakaCost,
  }
}

function branchSheetName(branch: Pick<Branch, 'name'>) {
  return branch.name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '') || 'branch'
}

function reportFilename(prefix: string, period: ReportPeriod) {
  return `${prefix}_${period}_report_${toLocalDateInput(new Date())}`
}

function emptyTable(headers: ExcelCellValue[], rows: ExcelCellValue[][]) {
  return [headers, ...(rows.length ? rows : [['No records in this period']])]
}

function summaryRows(data: BranchReportData, range: PeriodRange, totals: BranchTotals): ExcelCellValue[][] {
  return [
    ['CapitalBet Branch Report'],
    ['Branch', data.branch.name],
    ['Region', data.branch.region],
    ['Period', range.label],
    ['Start Date', toLocalDateInput(range.start)],
    ['End Date', toLocalDateInput(addDays(range.end, -1))],
    ['Generated At', formatDateTime(new Date())],
    [],
    ['Metric', 'Value'],
    ['Power Outages', totals.outages],
    ['Generator Minutes', totals.generatorMinutes],
    ['Generator Hours', Number((totals.generatorMinutes / 60).toFixed(2))],
    ['Fuel Refills', totals.fuelRefills],
    ['Fuel Litres', Number(totals.fuelLitres.toFixed(2))],
    ['Fuel Cost UGX', totals.fuelCost],
    ['Service Records', totals.serviceRecords],
    ['Service Cost UGX', totals.serviceCost],
    ['Repair Records', totals.repairRecords],
    ['Repair Cost UGX', totals.repairCost],
    ['DSTV Cost UGX', totals.dstvCost],
    ['Yaka Units', Number(totals.yakaUnits.toFixed(2))],
    ['Yaka Cost UGX', totals.yakaCost],
    ['Total Cost UGX', totals.totalCost],
  ]
}

function dailyRows(data: BranchReportData, rows: BranchPeriodRows, range: PeriodRange) {
  const days: ExcelCellValue[][] = []
  for (let day = new Date(range.start); day < range.end; day = addDays(day, 1)) {
    const next = addDays(day, 1)
    const dayRange = { label: '', start: day, end: next }
    const dateKey = toLocalDateInput(day)
    const dayRefills = rows.refills.filter((row) => row.refill_date === dateKey)
    const dayServices = rows.services.filter((row) => row.service_date === dateKey)
    const dayRepairs = rows.repairs.filter((row) => row.repair_date === dateKey)
    const dayDstv = rows.subscriptions.filter((row) => row.subscription_date === dateKey)
    const dayYaka = rows.purchases.filter((row) => row.purchase_date === dateKey)
    const fuelCost = dayRefills.reduce((sum, row) => sum + numberValue(row.cost), 0)
    const serviceCost = dayServices.reduce((sum, row) => sum + numberValue(row.cost), 0)
    const repairCost = dayRepairs.reduce((sum, row) => sum + numberValue(row.cost), 0)
    const dstvCost = dayDstv.reduce((sum, row) => sum + numberValue(row.amount), 0)
    const yakaCost = dayYaka.reduce((sum, row) => sum + numberValue(row.amount), 0)

    days.push([
      dateKey,
      data.branch.name,
      rows.sessions.filter((session) => inRange(new Date(session.started_at), dayRange)).length,
      rows.sessions.reduce((sum, session) => sum + sessionMinutes(session, dayRange), 0),
      Number(dayRefills.reduce((sum, row) => sum + numberValue(row.litres), 0).toFixed(2)),
      fuelCost,
      dayServices.length,
      serviceCost,
      dayRepairs.length,
      repairCost,
      dstvCost,
      Number(dayYaka.reduce((sum, row) => sum + numberValue(row.units), 0).toFixed(2)),
      yakaCost,
      fuelCost + serviceCost + repairCost + dstvCost + yakaCost,
    ])
  }
  return days
}

function buildBranchSheets(data: BranchReportData, period: ReportPeriod): ExcelSheet[] {
  const range = periodRange(period)
  const rows = filterBranchRows(data, range)
  const totals = calculateTotals(rows, range)

  return [
    { name: 'Summary', rows: summaryRows(data, range, totals) },
    {
      name: 'Daily Breakdown',
      rows: emptyTable(
        [
          'Date',
          'Branch',
          'Power Outages',
          'Generator Minutes',
          'Fuel Litres',
          'Fuel Cost UGX',
          'Services',
          'Service Cost UGX',
          'Repairs',
          'Repair Cost UGX',
          'DSTV Cost UGX',
          'Yaka Units',
          'Yaka Cost UGX',
          'Total Cost UGX',
        ],
        dailyRows(data, rows, range)
      ),
    },
    {
      name: 'Power',
      rows: emptyTable(
        ['Date', 'Started At', 'Ended At', 'Duration Minutes', 'Ongoing', 'Notes'],
        rows.sessions.map((row) => [
          row.session_date,
          formatDateTime(row.started_at),
          row.ended_at ? formatDateTime(row.ended_at) : '',
          sessionMinutes(row, range),
          row.is_ongoing ? 'Yes' : 'No',
          row.notes ?? '',
        ])
      ),
    },
    {
      name: 'Fuel',
      rows: emptyTable(
        ['Date', 'Litres', 'Cost UGX', 'Authorized By', 'Remarks'],
        rows.refills.map((row) => [row.refill_date, numberValue(row.litres), numberValue(row.cost), row.authorized_by, row.remarks ?? ''])
      ),
    },
    {
      name: 'Servicing',
      rows: emptyTable(
        ['Type', 'Date', 'Next Due', 'Category', 'Technician or Handler', 'Items/Repaired Done', 'Cost UGX', 'Details', 'Remarks'],
        [
          ...rows.services.map((row) => [
            'Service',
            row.service_date,
            row.next_service_date,
            '',
            row.technician_name,
            serviceDetailText(row),
            numberValue(row.cost),
            row.work_done,
            row.remarks ?? '',
          ]),
          ...rows.repairs.map((row) => [
            'Repair',
            row.repair_date,
            '',
            row.category,
            row.handled_by ?? '',
            '',
            numberValue(row.cost),
            row.description,
            row.remarks ?? '',
          ]),
        ]
      ),
    },
    {
      name: 'Utilities',
      rows: emptyTable(
        ['Type', 'Date', 'Renewal or Expected Reload', 'Identifier', 'Package or Units', 'Amount UGX', 'Receipt', 'Remarks'],
        [
          ...rows.subscriptions.map((row) => [
            'DSTV',
            row.subscription_date,
            row.renewal_date,
            row.smart_card_number,
            row.package,
            numberValue(row.amount),
            row.receipt_number ?? '',
            row.remarks ?? '',
          ]),
          ...rows.purchases.map((row) => [
            'Yaka',
            row.purchase_date,
            row.expected_reload_date,
            row.meter_number,
            numberValue(row.units),
            numberValue(row.amount),
            row.receipt_number ?? '',
            row.remarks ?? '',
          ]),
        ]
      ),
    },
  ]
}

export function exportBranchOperationalReport(data: BranchReportData, period: ReportPeriod) {
  exportToXlsx(reportFilename(branchSheetName(data.branch), period), buildBranchSheets(data, period))
}

export function buildAdminReportSheets(data: AdminReportData, period: ReportPeriod): ExcelSheet[] {
  const range = periodRange(period)
  const branchMap = new Map(data.branches.map((branch) => [branch.id, branch]))
  const branchReports = data.branches.map((branch) => {
    const branchData: BranchReportData = {
      branch,
      sessions: data.sessions.filter((row) => row.branch_id === branch.id),
      refills: data.refills.filter((row) => row.branch_id === branch.id),
      services: data.services.filter((row) => row.branch_id === branch.id),
      repairs: data.repairs.filter((row) => row.branch_id === branch.id),
      subscriptions: data.subscriptions.filter((row) => row.branch_id === branch.id),
      purchases: data.purchases.filter((row) => row.branch_id === branch.id),
    }
    const rows = filterBranchRows(branchData, range)
    return { branch, rows, totals: calculateTotals(rows, range) }
  })

  const grandTotals = branchReports.reduce(
    (acc, item) => ({
      outages: acc.outages + item.totals.outages,
      generatorMinutes: acc.generatorMinutes + item.totals.generatorMinutes,
      fuelRefills: acc.fuelRefills + item.totals.fuelRefills,
      fuelLitres: acc.fuelLitres + item.totals.fuelLitres,
      fuelCost: acc.fuelCost + item.totals.fuelCost,
      serviceRecords: acc.serviceRecords + item.totals.serviceRecords,
      serviceCost: acc.serviceCost + item.totals.serviceCost,
      repairRecords: acc.repairRecords + item.totals.repairRecords,
      repairCost: acc.repairCost + item.totals.repairCost,
      dstvRecords: acc.dstvRecords + item.totals.dstvRecords,
      dstvCost: acc.dstvCost + item.totals.dstvCost,
      yakaRecords: acc.yakaRecords + item.totals.yakaRecords,
      yakaUnits: acc.yakaUnits + item.totals.yakaUnits,
      yakaCost: acc.yakaCost + item.totals.yakaCost,
      totalCost: acc.totalCost + item.totals.totalCost,
    }),
    {
      outages: 0,
      generatorMinutes: 0,
      fuelRefills: 0,
      fuelLitres: 0,
      fuelCost: 0,
      serviceRecords: 0,
      serviceCost: 0,
      repairRecords: 0,
      repairCost: 0,
      dstvRecords: 0,
      dstvCost: 0,
      yakaRecords: 0,
      yakaUnits: 0,
      yakaCost: 0,
      totalCost: 0,
    }
  )

  return [
    {
      name: 'Summary',
      rows: [
        ['CapitalBet Admin Report'],
        ['Period', range.label],
        ['Start Date', toLocalDateInput(range.start)],
        ['End Date', toLocalDateInput(addDays(range.end, -1))],
        ['Generated At', formatDateTime(new Date())],
        ['Branches', data.branches.length],
        [],
        ['Metric', 'Value'],
        ['Power Outages', grandTotals.outages],
        ['Generator Minutes', grandTotals.generatorMinutes],
        ['Generator Hours', Number((grandTotals.generatorMinutes / 60).toFixed(2))],
        ['Fuel Litres', Number(grandTotals.fuelLitres.toFixed(2))],
        ['Fuel Cost UGX', grandTotals.fuelCost],
        ['Service Cost UGX', grandTotals.serviceCost],
        ['Repair Cost UGX', grandTotals.repairCost],
        ['DSTV Cost UGX', grandTotals.dstvCost],
        ['Yaka Cost UGX', grandTotals.yakaCost],
        ['Total Cost UGX', grandTotals.totalCost],
      ],
    },
    {
      name: 'Branch Totals',
      rows: emptyTable(
        [
          'Branch',
          'Region',
          'Power Outages',
          'Generator Minutes',
          'Fuel Litres',
          'Fuel Cost UGX',
          'Services',
          'Service Cost UGX',
          'Repairs',
          'Repair Cost UGX',
          'DSTV Cost UGX',
          'Yaka Units',
          'Yaka Cost UGX',
          'Total Cost UGX',
        ],
        branchReports.map(({ branch, totals }) => [
          branch.name,
          branch.region,
          totals.outages,
          totals.generatorMinutes,
          Number(totals.fuelLitres.toFixed(2)),
          totals.fuelCost,
          totals.serviceRecords,
          totals.serviceCost,
          totals.repairRecords,
          totals.repairCost,
          totals.dstvCost,
          Number(totals.yakaUnits.toFixed(2)),
          totals.yakaCost,
          totals.totalCost,
        ])
      ),
    },
    {
      name: 'Power',
      rows: emptyTable(
        ['Branch', 'Region', 'Date', 'Started At', 'Ended At', 'Duration Minutes', 'Ongoing', 'Notes'],
        data.sessions
          .filter((row) => sessionTouchesRange(row, range))
          .map((row) => {
            const branch = branchMap.get(row.branch_id)
            return [
              branch?.name ?? 'Unknown',
              branch?.region ?? '',
              row.session_date,
              formatDateTime(row.started_at),
              row.ended_at ? formatDateTime(row.ended_at) : '',
              sessionMinutes(row, range),
              row.is_ongoing ? 'Yes' : 'No',
              row.notes ?? '',
            ]
          })
      ),
    },
    {
      name: 'Fuel',
      rows: emptyTable(
        ['Branch', 'Region', 'Date', 'Litres', 'Cost UGX', 'Authorized By', 'Remarks'],
        data.refills
          .filter((row) => inRange(localDate(row.refill_date), range))
          .map((row) => {
            const branch = branchMap.get(row.branch_id)
            return [branch?.name ?? 'Unknown', branch?.region ?? '', row.refill_date, numberValue(row.litres), numberValue(row.cost), row.authorized_by, row.remarks ?? '']
          })
      ),
    },
    {
      name: 'Servicing',
      rows: emptyTable(
        ['Branch', 'Region', 'Type', 'Date', 'Next Due', 'Category', 'Technician or Handler', 'Items/Repaired Done', 'Cost UGX', 'Details', 'Remarks'],
        [
          ...data.services
            .filter((row) => inRange(localDate(row.service_date), range))
            .map((row) => {
              const branch = branchMap.get(row.branch_id)
              return [branch?.name ?? 'Unknown', branch?.region ?? '', 'Service', row.service_date, row.next_service_date, '', row.technician_name, serviceDetailText(row), numberValue(row.cost), row.work_done, row.remarks ?? '']
            }),
          ...data.repairs
            .filter((row) => inRange(localDate(row.repair_date), range))
            .map((row) => {
              const branch = branchMap.get(row.branch_id)
              return [branch?.name ?? 'Unknown', branch?.region ?? '', 'Repair', row.repair_date, '', row.category, row.handled_by ?? '', '', numberValue(row.cost), row.description, row.remarks ?? '']
            }),
        ]
      ),
    },
    {
      name: 'Utilities',
      rows: emptyTable(
        ['Branch', 'Region', 'Type', 'Date', 'Renewal or Expected Reload', 'Identifier', 'Package or Units', 'Amount UGX', 'Receipt', 'Remarks'],
        [
          ...data.subscriptions
            .filter((row) => inRange(localDate(row.subscription_date), range))
            .map((row) => {
              const branch = branchMap.get(row.branch_id)
              return [branch?.name ?? 'Unknown', branch?.region ?? '', 'DSTV', row.subscription_date, row.renewal_date, row.smart_card_number, row.package, numberValue(row.amount), row.receipt_number ?? '', row.remarks ?? '']
            }),
          ...data.purchases
            .filter((row) => inRange(localDate(row.purchase_date), range))
            .map((row) => {
              const branch = branchMap.get(row.branch_id)
              return [branch?.name ?? 'Unknown', branch?.region ?? '', 'Yaka', row.purchase_date, row.expected_reload_date, row.meter_number, numberValue(row.units), numberValue(row.amount), row.receipt_number ?? '', row.remarks ?? '']
            }),
        ]
      ),
    },
  ]
}

export function exportAdminOperationalReport(data: AdminReportData, period: ReportPeriod) {
  exportToXlsx(reportFilename('capitalbet_admin', period), buildAdminReportSheets(data, period))
}
