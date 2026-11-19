const { useState, useEffect, useRef, useMemo } = React;

// Main Application Component
function App() {
    // Navigation State
    const [activePage, setActivePage] = useState('dashboard');
    
    // Telemetry State
    const [connected, setConnected] = useState(false);
    const [systemTime, setSystemTime] = useState(new Date().toLocaleTimeString());
    const [telemetry, setTelemetry] = useState(null);
    const [simulationMode, setSimulationMode] = useState('NORMAL');
    const [activeAlertsCount, setActiveAlertsCount] = useState(0);

    // Socket.IO Ref
    const socketRef = useRef(null);

    // Live Clock
    useEffect(() => {
        const timer = setInterval(() => {
            setSystemTime(new Date().toLocaleTimeString());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // WebSocket / Polling Connection
    useEffect(() => {
        // 1. Regular 2-second Telemetry Fetch (Guaranteed continuous stream)
        const fetchTelemetry = async () => {
            try {
                const res = await fetch('/api/telemetry');
                if (res.ok) {
                    const data = await res.json();
                    setTelemetry(data);
                    setConnected(true);
                    setSimulationMode(data.simulation_status || 'NORMAL');
                    setActiveAlertsCount(data.active_alerts_count || 0);
                }
            } catch (e) {
                console.warn('Telemetry fetch error:', e);
            }
        };

        fetchTelemetry(); // Initial immediate call
        const pollInterval = setInterval(fetchTelemetry, 2000); // Ticks every 2 seconds!

        // 2. Real-Time Socket.IO Listener
        try {
            const socket = io(window.location.origin, {
                reconnectionDelay: 1000,
                transports: ['websocket', 'polling']
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                setConnected(true);
                console.log('Connected to Power Plant WebSocket Server');
            });

            socket.on('disconnect', () => {
                console.warn('WebSocket disconnected - Polling active');
            });

            socket.on('telemetry_update', (data) => {
                setTelemetry(data);
                setConnected(true);
                setSimulationMode(data.simulation_status || 'NORMAL');
                setActiveAlertsCount(data.active_alerts_count || 0);
            });
        } catch (err) {
            console.warn('Socket.IO init error, falling back to REST stream:', err);
        }

        return () => {
            clearInterval(pollInterval);
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
            {/* Sidebar Navigation */}
            <Sidebar activePage={activePage} setActivePage={setActivePage} activeAlertsCount={activeAlertsCount} />

            {/* Main Content Area */}
            <div className="flex flex-col flex-1 overflow-hidden">
                {/* Top Navigation Bar */}
                <TopNavbar 
                    systemTime={systemTime} 
                    connected={connected} 
                    simulationMode={simulationMode}
                    telemetry={telemetry}
                />

                {/* Sub-Header SCADA Telemetry Stream Status */}
                <div className="px-6 py-2 text-xs flex flex-wrap items-center justify-between bg-slate-900/60 border-b border-slate-800 text-slate-300 gap-2">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <strong className="text-emerald-400 font-mono">SCADA DCS ONLINE:</strong>
                        <span>Real-Time Telemetry Active | Sampling Rate: 2.0s | Grid Frequency: 50.0 Hz | Unit #4 Baseload Dispatch</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                            SIMULATION MODE
                        </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                        Station: Satpura Super Thermal Power Station • 500 MW Combined Cycle #4
                    </div>
                </div>

                {/* Dynamic Page Router */}
                <main className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activePage === 'dashboard' && <DashboardPage telemetry={telemetry} setActivePage={setActivePage} />}
                    {activePage === 'plant-overview' && <PlantOverviewPage telemetry={telemetry} />}
                    {activePage === 'sensors' && <SensorMonitoringPage telemetry={telemetry} />}
                    {activePage === 'equipment' && <EquipmentMonitoringPage telemetry={telemetry} />}
                    {activePage === 'alerts' && <AlertsPage />}
                    {activePage === 'historical' && <HistoricalAnalysisPage />}
                    {activePage === 'thirty-day' && <ThirtyDayPerformancePage />}
                </main>
            </div>
        </div>
    );
}

// ==============================================================================
// COMPONENT: SIDEBAR
// ==============================================================================
function Sidebar({ activePage, setActivePage, activeAlertsCount }) {
    const navItems = [
        { id: 'dashboard', label: 'Live Dashboard', icon: 'fa-gauge-high' },
        { id: 'plant-overview', label: 'Plant Overview', icon: 'fa-industry' },
        { id: 'sensors', label: 'Sensor Monitoring', icon: 'fa-microchip' },
        { id: 'equipment', label: 'Equipment Status', icon: 'fa-gears' },
        { id: 'alerts', label: 'Alerts & Anomalies', icon: 'fa-triangle-exclamation', badge: activeAlertsCount },
        { id: 'historical', label: 'Historical Analysis', icon: 'fa-chart-line' },
        { id: 'thirty-day', label: '30-Day Performance', icon: 'fa-calendar-days' },
    ];

    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
            <div>
                {/* Brand Header */}
                <div className="p-5 border-b border-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                        <i className="fa-solid fa-bolt text-lg"></i>
                    </div>
                    <div>
                        <h1 className="font-extrabold text-sm tracking-tight text-white leading-tight">PowerPlant<span className="text-sky-400">IQ</span></h1>
                        <span className="text-[10px] text-slate-400 block font-medium">500 MW Live SCADA</span>
                    </div>
                </div>

                {/* Nav Links */}
                <nav className="p-3 space-y-1">
                    {navItems.map(item => {
                        const isActive = activePage === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActivePage(item.id)}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                                    isActive 
                                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <i className={`fa-solid ${item.icon} text-sm w-4 text-center ${isActive ? 'text-sky-400' : 'text-slate-500'}`}></i>
                                    <span>{item.label}</span>
                                </div>
                                {item.badge > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Bottom Status Box */}
            <div className="p-4 border-t border-slate-800 m-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Unit Capacity</div>
                <div className="text-lg font-black text-white mt-0.5">500.0 <span className="text-xs font-normal text-slate-400">MW</span></div>
                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Grid Synchronized (50 Hz)
                </div>
            </div>
        </aside>
    );
}

// ==============================================================================
// COMPONENT: TOP NAVBAR
// ==============================================================================
function TopNavbar({ systemTime, connected, simulationMode, telemetry }) {
    const powerMw = telemetry?.kpis?.power_output_mw?.current || 485.4;
    const efficiency = telemetry?.kpis?.plant_efficiency_pct?.current || 41.2;

    return (
        <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                <h2 className="text-sm font-bold text-slate-200 tracking-wide uppercase">
                    Live Power Plant Performance Analysis & Monitoring System
                </h2>
                <span className="hidden lg:inline text-xs text-slate-500">|</span>
                <span className="hidden lg:inline text-xs text-slate-400 font-medium">
                    Satpura Unit #4
                </span>
            </div>

            <div className="flex items-center gap-4">
                {/* Live Output Meter */}
                <div className="hidden md:flex items-center gap-3 bg-slate-950 px-3.5 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
                    <span className="text-slate-400">GEN:</span>
                    <span className="text-sky-400 font-bold">{powerMw.toFixed(1)} MW</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">EFF:</span>
                    <span className="text-emerald-400 font-bold">{efficiency.toFixed(1)}%</span>
                </div>

                {/* Connection Status Indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
                    <span className={`pulse-dot ${connected ? 'bg-emerald-400' : 'bg-rose-500'}`}></span>
                    <span className="font-semibold text-slate-300">
                        {connected ? 'WebSocket LIVE' : 'Reconnecting...'}
                    </span>
                </div>

                {/* Clock */}
                <div className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                    <i className="fa-regular fa-clock text-slate-500 mr-1.5"></i>
                    {systemTime}
                </div>
            </div>
        </header>
    );
}

// ==============================================================================
// PAGE 1: LIVE DASHBOARD
// ==============================================================================
function DashboardPage({ telemetry, setActivePage }) {
    const kpis = telemetry?.kpis || {
        total_electricity_mwh: { current: 11648.5, previous: 11646.2, change_pct: 0.02, status: 'NORMAL' },
        natural_gas_consumed_scm: { current: 88450.0, previous: 88200.0, change_pct: 0.28, status: 'NORMAL' },
        water_consumed_kl: { current: 36960.0, previous: 36940.0, change_pct: 0.05, status: 'NORMAL' },
        steam_generated_tonnes: { current: 35640.0, previous: 35620.0, change_pct: 0.06, status: 'NORMAL' },
        power_output_mw: { current: 485.4, previous: 484.2, change_pct: 0.25, status: 'NORMAL' },
        plant_efficiency_pct: { current: 41.25, previous: 41.10, change_pct: 0.36, status: 'NORMAL' }
    };

    const timeSeries = telemetry?.time_series || [];

    return (
        <div className="space-y-6">
            {/* 6 KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <KpiCard 
                    title="Electricity Generated"
                    value={kpis.total_electricity_mwh.current.toLocaleString()}
                    unit="MWh"
                    change={kpis.total_electricity_mwh.change_pct}
                    prev={kpis.total_electricity_mwh.previous.toLocaleString()}
                    status={kpis.total_electricity_mwh.status}
                    icon="fa-bolt"
                    sparklineData={[11610, 11620, 11632, 11640, 11648]}
                />
                <KpiCard 
                    title="Natural Gas Consumed"
                    value={kpis.natural_gas_consumed_scm.current.toLocaleString()}
                    unit="SCM/h"
                    change={kpis.natural_gas_consumed_scm.change_pct}
                    prev={kpis.natural_gas_consumed_scm.previous.toLocaleString()}
                    status={kpis.natural_gas_consumed_scm.status}
                    icon="fa-fire-flame-simple"
                    sparklineData={[88100, 88250, 88300, 88200, 88450]}
                />
                <KpiCard 
                    title="Water Consumed"
                    value={kpis.water_consumed_kl.current.toLocaleString()}
                    unit="KL"
                    change={kpis.water_consumed_kl.change_pct}
                    prev={kpis.water_consumed_kl.previous.toLocaleString()}
                    status={kpis.water_consumed_kl.status}
                    icon="fa-droplet"
                    sparklineData={[36900, 36920, 36935, 36940, 36960]}
                />
                <KpiCard 
                    title="Steam Generated"
                    value={kpis.steam_generated_tonnes.current.toLocaleString()}
                    unit="Tonnes"
                    change={kpis.steam_generated_tonnes.change_pct}
                    prev={kpis.steam_generated_tonnes.previous.toLocaleString()}
                    status={kpis.steam_generated_tonnes.status}
                    icon="fa-cloud"
                    sparklineData={[35580, 35600, 35615, 35620, 35640]}
                />
                <KpiCard 
                    title="Current Power Output"
                    value={kpis.power_output_mw.current.toFixed(1)}
                    unit="MW"
                    change={kpis.power_output_mw.change_pct}
                    prev={kpis.power_output_mw.previous.toFixed(1)}
                    status={kpis.power_output_mw.status}
                    icon="fa-gauge-high"
                    sparklineData={timeSeries.map(p => p.power_mw).slice(-10)}
                    highlight={true}
                />
                <KpiCard 
                    title="Plant Efficiency"
                    value={kpis.plant_efficiency_pct.current.toFixed(2)}
                    unit="%"
                    change={kpis.plant_efficiency_pct.change_pct}
                    prev={kpis.plant_efficiency_pct.previous.toFixed(2)}
                    status={kpis.plant_efficiency_pct.status}
                    icon="fa-chart-pie"
                    sparklineData={timeSeries.map(p => p.efficiency).slice(-10)}
                />
            </div>

            {/* 2-Column Live Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="scada-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <i className="fa-solid fa-chart-line text-sky-400"></i>
                            Electricity Generation (MW) vs Time
                        </h3>
                        <span className="text-[10px] text-slate-500 font-mono">Live Window (Latest 40 pts)</span>
                    </div>
                    <div className="h-64">
                        <LiveLineChart 
                            data={timeSeries} 
                            dataKey="power_mw" 
                            lineColor="#38bdf8" 
                            unit="MW" 
                            minVal={300} 
                            maxVal={520} 
                        />
                    </div>
                </div>

                <div className="scada-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <i className="fa-solid fa-fire text-amber-400"></i>
                            Natural Gas Consumption (SCM/h)
                        </h3>
                        <span className="text-[10px] text-slate-500 font-mono">Real-time Stream</span>
                    </div>
                    <div className="h-64">
                        <LiveLineChart 
                            data={timeSeries} 
                            dataKey="gas_flow" 
                            lineColor="#f59e0b" 
                            unit="SCM/h" 
                            minVal={50000} 
                            maxVal={100000} 
                        />
                    </div>
                </div>

                <div className="scada-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <i className="fa-solid fa-cloud text-indigo-400"></i>
                            Steam Generation (TPH) & Water Flow
                        </h3>
                        <span className="text-[10px] text-slate-500 font-mono">Boiler Dynamics</span>
                    </div>
                    <div className="h-64">
                        <LiveLineChart 
                            data={timeSeries} 
                            dataKey="steam_flow" 
                            lineColor="#818cf8" 
                            unit="TPH" 
                            minVal={1000} 
                            maxVal={1700} 
                        />
                    </div>
                </div>

                <div className="scada-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <i className="fa-solid fa-temperature-half text-rose-400"></i>
                            Boiler Furnace Temperature (°C)
                        </h3>
                        <span className="text-[10px] text-slate-500 font-mono">Thermal Limits</span>
                    </div>
                    <div className="h-64">
                        <LiveLineChart 
                            data={timeSeries} 
                            dataKey="boiler_temp" 
                            lineColor="#f43f5e" 
                            unit="°C" 
                            minVal={900} 
                            maxVal={1300} 
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Row: Quick Sensors Snapshot & Recent Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="scada-card p-5 lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            Critical Sensors Telemetry Snapshot
                        </h3>
                        <button onClick={() => setActivePage('sensors')} className="text-xs text-sky-400 hover:underline">
                            View All Sensors →
                        </button>
                    </div>
                    <QuickSensorTable sensors={telemetry?.sensors} />
                </div>

                <div className="scada-card p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            Active Anomaly Alerts
                        </h3>
                        <button onClick={() => setActivePage('alerts')} className="text-xs text-sky-400 hover:underline">
                            Alert Center →
                        </button>
                    </div>
                    <QuickAlertsList alerts={telemetry?.recent_alerts || []} />
                </div>
            </div>
        </div>
    );
}

// KPI CARD COMPONENT WITH SPARKLINE
function KpiCard({ title, value, unit, change, prev, status, icon, highlight }) {
    const isPositive = change >= 0;
    const statusColor = status === 'CRITICAL' ? 'text-rose-400' : (status === 'WARNING' ? 'text-amber-400' : 'text-emerald-400');
    
    return (
        <div className={`scada-card p-4 flex flex-col justify-between ${highlight ? 'border-sky-500/50 bg-sky-950/20 shadow-lg shadow-sky-500/10' : ''}`}>
            <div>
                <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-[11px] truncate">{title}</span>
                    <span className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        LIVE
                    </span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-2xl font-black text-white font-mono tracking-tight">{value}</span>
                    <span className="text-xs font-bold text-slate-400">{unit}</span>
                </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1">
                    <span className={`font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{change}%
                    </span>
                    <span className="text-slate-500 text-[10px]">vs prev</span>
                </div>
                <span className={`text-[10px] font-bold uppercase ${statusColor}`}>
                    ● {status}
                </span>
            </div>
        </div>
    );
}

// QUICK SENSOR TABLE ON DASHBOARD
function QuickSensorTable({ sensors }) {
    if (!sensors) return <div className="text-xs text-slate-500 p-4">Awaiting telemetry packet...</div>;

    const list = [
        { id: 'ELEC-01', name: 'Power Output', val: sensors['ELEC-01'], unit: 'MW', norm: '250 - 520 MW' },
        { id: 'GAS-01', name: 'Natural Gas Flow', val: sensors['GAS-01'], unit: 'SCM/h', norm: '60k - 98k' },
        { id: 'STM-03', name: 'Main Steam Pressure', val: sensors['STM-03'], unit: 'bar', norm: '145 - 185 bar' },
        { id: 'TMP-01', name: 'Boiler Furnace Temp', val: sensors['TMP-01'], unit: '°C', norm: '950 - 1250 °C' },
        { id: 'VIB-01', name: 'Turbine Vibration', val: sensors['VIB-01'], unit: 'mm/s', norm: '< 4.5 mm/s' },
    ];

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left scada-table">
                <thead>
                    <tr>
                        <th>Sensor ID</th>
                        <th>Parameter</th>
                        <th>Current Value</th>
                        <th>Normal Range</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {list.map(s => {
                        const val = s.val || 0;
                        const isWarn = (s.id === 'TMP-01' && val > 1200) || (s.id === 'VIB-01' && val > 3.2);
                        const isCrit = (s.id === 'TMP-01' && val > 1250) || (s.id === 'VIB-01' && val > 4.5);
                        const badgeClass = isCrit ? 'badge-critical' : (isWarn ? 'badge-warning' : 'badge-normal');
                        const statusText = isCrit ? 'CRITICAL' : (isWarn ? 'WARNING' : 'NORMAL');

                        return (
                            <tr key={s.id}>
                                <td className="font-mono text-sky-400 font-bold">{s.id}</td>
                                <td className="text-slate-200 font-medium">{s.name}</td>
                                <td className="font-mono font-bold text-white">{typeof val === 'number' ? val.toFixed(1) : val} {s.unit}</td>
                                <td className="text-slate-400 text-xs">{s.norm}</td>
                                <td>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                                        {statusText}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// QUICK ALERTS LIST ON DASHBOARD
function QuickAlertsList({ alerts }) {
    if (!alerts || alerts.length === 0) {
        return (
            <div className="p-6 text-center text-xs text-slate-500">
                <i className="fa-solid fa-shield-check text-emerald-500 text-2xl mb-2 block"></i>
                No active critical anomalies detected. System operating within design envelope.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {alerts.slice(0, 4).map((a, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${a.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                        {a.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-200 truncate">{a.sensor_name}: {a.alert_type}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Reading: {a.current_reading} (Threshold: {a.threshold_value})</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// LIVE LINE CHART COMPONENT (Chart.js Canvas in React)
function LiveLineChart({ data, dataKey, lineColor, unit, minVal, maxVal }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');

        const safeData = (data && data.length > 0) ? data : [
            { time: '00:00:01', [dataKey]: (minVal + maxVal)/2 },
            { time: '00:00:03', [dataKey]: (minVal + maxVal)/2 + 2 },
            { time: '00:00:05', [dataKey]: (minVal + maxVal)/2 - 1 }
        ];

        const labels = safeData.map(d => d.time);
        const values = safeData.map(d => d[dataKey]);

        if (chartRef.current) {
            chartRef.current.data.labels = labels;
            chartRef.current.data.datasets[0].data = values;
            chartRef.current.update();
        } else {
            chartRef.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: unit,
                        data: values,
                        borderColor: lineColor,
                        backgroundColor: lineColor + '20',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 350 },
                    scales: {
                        x: { display: true, grid: { color: '#1e293b' }, ticks: { color: '#64748b', maxTicksLimit: 7, font: { size: 10 } } },
                        y: { min: minVal, max: maxVal, grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }, [data, dataKey, lineColor, unit, minVal, maxVal]);

    useEffect(() => {
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, []);

    return <canvas ref={canvasRef} />;
}

// ==============================================================================
// PAGE 2: PLANT OVERVIEW
// ==============================================================================
function PlantOverviewPage({ telemetry }) {
    const [statusData, setStatusData] = useState(null);

    useEffect(() => {
        fetch('/api/status').then(r => r.json()).then(d => setStatusData(d)).catch(console.error);
    }, [telemetry]);

    const loadPct = statusData?.load_percentage || 97.1;
    const currentMw = statusData?.current_generation_mw || 485.4;

    return (
        <div className="space-y-6">
            <div className="scada-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-sky-400 bg-sky-950 px-3 py-1 rounded-full border border-sky-800">Operational Overview</span>
                        <h2 className="text-2xl font-black text-white mt-2">500 MW Combined Cycle Unit Status</h2>
                        <p className="text-xs text-slate-400 mt-1">High-efficiency gas turbine generator coupled with steam reheat cycle.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                            ● GRID DISPATCH: NORMAL
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400 uppercase font-semibold">Total Plant Capacity</span>
                        <div className="text-3xl font-black text-white mt-1">500.0 <span className="text-sm font-normal text-slate-400">MW</span></div>
                        <span className="text-[11px] text-slate-500">Nameplate Baseline</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400 uppercase font-semibold">Current Generation</span>
                        <div className="text-3xl font-black text-sky-400 mt-1">{currentMw.toFixed(1)} <span className="text-sm font-normal text-slate-400">MW</span></div>
                        <span className="text-[11px] text-emerald-400 font-semibold">Dispatched Load</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400 uppercase font-semibold">Plant Load Percentage</span>
                        <div className="text-3xl font-black text-indigo-400 mt-1">{loadPct}%</div>
                        <span className="text-[11px] text-slate-400">Capacity Factor Target: 90%+</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400 uppercase font-semibold">Operating State</span>
                        <div className="text-2xl font-black text-emerald-400 mt-1">BASELOAD</div>
                        <span className="text-[11px] text-slate-400">Heat Rate: 2,092 kcal/kWh</span>
                    </div>
                </div>
            </div>

            {/* Equipment Fleet Status Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="scada-card p-4 border-l-4 border-l-emerald-500">
                    <span className="text-xs text-slate-400 uppercase font-bold">Running Equipment</span>
                    <div className="text-3xl font-black text-emerald-400 mt-1">{statusData?.equipment_stats?.running || 5}</div>
                    <span className="text-[10px] text-slate-500">In continuous service</span>
                </div>
                <div className="scada-card p-4 border-l-4 border-l-amber-500">
                    <span className="text-xs text-slate-400 uppercase font-bold">Stopped Equipment</span>
                    <div className="text-3xl font-black text-amber-400 mt-1">{statusData?.equipment_stats?.stopped || 0}</div>
                    <span className="text-[10px] text-slate-500">Cold / Hot Standby</span>
                </div>
                <div className="scada-card p-4 border-l-4 border-l-rose-500">
                    <span className="text-xs text-slate-400 uppercase font-bold">Fault / Tripped</span>
                    <div className="text-3xl font-black text-rose-400 mt-1">{statusData?.equipment_stats?.fault || 0}</div>
                    <span className="text-[10px] text-slate-500">Requires maintenance</span>
                </div>
                <div className="scada-card p-4 border-l-4 border-l-sky-500">
                    <span className="text-xs text-slate-400 uppercase font-bold">Overall Fleet Health</span>
                    <div className="text-3xl font-black text-sky-400 mt-1">98.4%</div>
                    <span className="text-[10px] text-slate-500">Reliability Index</span>
                </div>
            </div>
        </div>
    );
}

// ==============================================================================
// PAGE 3: SENSOR MONITORING PAGE
// ==============================================================================
function SensorMonitoringPage({ telemetry }) {
    const [sensors, setSensors] = useState([]);
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState('sensor_id');

    useEffect(() => {
        fetch('/api/sensors').then(r => r.json()).then(d => setSensors(d)).catch(console.error);
    }, [telemetry]);

    const categories = ['All', 'Electrical', 'Gas', 'Water', 'Steam', 'Temperature', 'Vibration'];

    const filtered = useMemo(() => {
        return sensors.filter(s => {
            const matchesCat = categoryFilter === 'All' || s.category.toLowerCase() === categoryFilter.toLowerCase();
            const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  s.sensor_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  s.equipment.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesCat && matchesSearch;
        }).sort((a, b) => {
            if (sortKey === 'current_value') return b.current_value - a.current_value;
            return a.sensor_id.localeCompare(b.sensor_id);
        });
    }, [sensors, categoryFilter, searchTerm, sortKey]);

    return (
        <div className="space-y-6">
            <div className="scada-card p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-4">
                    <div>
                        <h2 className="text-xl font-extrabold text-white">Sensor Telemetry Database</h2>
                        <p className="text-xs text-slate-400">Real-time parameters streamed from field transmitters and transducers.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-500 text-xs"></i>
                            <input 
                                type="text"
                                placeholder="Search by name, ID, equipment..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500 w-64"
                            />
                        </div>
                    </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                categoryFilter === cat 
                                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' 
                                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Sensor Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left scada-table">
                        <thead>
                            <tr>
                                <th onClick={() => setSortKey('sensor_id')} className="cursor-pointer">Sensor ID ↕</th>
                                <th>Sensor Name</th>
                                <th>Equipment</th>
                                <th>Category</th>
                                <th onClick={() => setSortKey('current_value')} className="cursor-pointer">Live Reading ↕</th>
                                <th>Normal Range</th>
                                <th>Status</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(s => {
                                const badgeClass = s.status === 'CRITICAL' ? 'badge-critical' : (s.status === 'WARNING' ? 'badge-warning' : 'badge-normal');
                                return (
                                    <tr key={s.sensor_id}>
                                        <td className="font-mono font-bold text-sky-400">{s.sensor_id}</td>
                                        <td className="font-bold text-slate-200">{s.name}</td>
                                        <td className="text-slate-300">{s.equipment}</td>
                                        <td>
                                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                                                {s.category}
                                            </span>
                                        </td>
                                        <td className="font-mono font-bold text-white text-sm">
                                            {typeof s.current_value === 'number' ? s.current_value.toFixed(2) : s.current_value} <span className="text-xs text-slate-400 font-normal">{s.unit}</span>
                                        </td>
                                        <td className="text-slate-400 text-xs font-mono">
                                            {s.min_safe} - {s.max_safe} {s.unit}
                                        </td>
                                        <td>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td className="text-slate-500 text-xs font-mono">{s.last_updated || 'Live'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ==============================================================================
// PAGE 4: EQUIPMENT & 12 BURNER CONTROLS PAGE
// ==============================================================================
function EquipmentMonitoringPage({ telemetry }) {
    const [equipment, setEquipment] = useState([]);
    const [burners, setBurners] = useState([]);
    const [burnersAutoMode, setBurnersAutoMode] = useState(true);
    const [statusMsg, setStatusMsg] = useState('');

    const loadEquipmentAndBurners = async () => {
        try {
            const [eqRes, bRes] = await Promise.all([
                fetch('/api/equipment'),
                fetch('/api/burners')
            ]);
            if (eqRes.ok) setEquipment(await eqRes.json());
            if (bRes.ok) {
                const bData = await bRes.json();
                setBurners(bData.burners || []);
                setBurnersAutoMode(bData.auto_mode ?? true);
            }
        } catch (e) {
            console.error('Error loading equipment/burners:', e);
        }
    };

    useEffect(() => {
        loadEquipmentAndBurners();
    }, [telemetry]);

    // Toggle individual burner ON / OFF
    const handleToggleBurner = async (burnerId, currentStatus) => {
        const newStatus = currentStatus === 'ON' ? 'OFF' : 'ON';
        try {
            const res = await fetch('/api/burners/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ burner_id: burnerId, status: newStatus })
            });
            if (res.ok) {
                setStatusMsg(`Burner #${burnerId} turned ${newStatus}`);
                setTimeout(() => setStatusMsg(''), 3000);
                loadEquipmentAndBurners();
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Toggle Master Burners Mode (AUTO vs MANUAL)
    const handleToggleBurnersMode = async () => {
        const newMode = !burnersAutoMode;
        try {
            const res = await fetch('/api/burners/mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_auto: newMode })
            });
            if (res.ok) {
                setBurnersAutoMode(newMode);
                setStatusMsg(`Burners switched to ${newMode ? 'AUTOMATIC THERMAL GOVERNOR' : 'MANUAL CONTROL'} mode`);
                setTimeout(() => setStatusMsg(''), 3500);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Toggle Equipment Running / Stopped or Mode (AUTO / MANUAL)
    const handleEquipmentAction = async (eqId, currentStatus, currentMode, actionType) => {
        const payload = { equipment_id: eqId };
        if (actionType === 'status') {
            payload.status = currentStatus === 'RUNNING' ? 'STOPPED' : 'RUNNING';
        } else if (actionType === 'mode') {
            payload.mode = currentMode === 'AUTO' ? 'MANUAL' : 'AUTO';
        }

        try {
            const res = await fetch('/api/equipment/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setStatusMsg(`Equipment ${eqId} updated`);
                setTimeout(() => setStatusMsg(''), 3000);
                loadEquipmentAndBurners();
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Quick All Burners ON/OFF
    const handleSetAllBurners = async (targetStatus) => {
        for (let i = 1; i <= 12; i++) {
            await fetch('/api/burners/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ burner_id: i, status: targetStatus })
            });
        }
        setStatusMsg(`All 12 Burners set to ${targetStatus}`);
        setTimeout(() => setStatusMsg(''), 3000);
        loadEquipmentAndBurners();
    };

    const activeBurnersCount = burners.filter(b => b.status === 'ON').length;
    const boilerTemp = telemetry?.sensors?.['TMP-01'] || 1140.0;
    const isOverheated = boilerTemp > 1220.0;

    return (
        <div className="space-y-8">
            {/* Status Message Notification Toast */}
            {statusMsg && (
                <div className="p-3 rounded-xl bg-sky-950 border border-sky-500 text-sky-300 text-xs font-mono flex items-center gap-2">
                    <i className="fa-solid fa-circle-check text-sky-400"></i>
                    <span>{statusMsg}</span>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION 1: 12 BOILER BURNERS MATRIX */}
            {/* ========================================================================= */}
            <div className="scada-card p-6 border-t-4 border-t-amber-500">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950 px-3 py-1 rounded-full border border-amber-800">
                                Boiler Combustion Control
                            </span>
                            <span className="text-xs font-mono text-slate-400">Total: 12 Corner Burners</span>
                        </div>
                        <h2 className="text-2xl font-black text-white mt-2 flex items-center gap-2.5">
                            <i className="fa-solid fa-fire-burner text-amber-500"></i>
                            12-Burner Thermal Actuator Fleet
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                            Automated thermal governance with high-temperature cut-off and manual corner modulation.
                        </p>
                    </div>

                    {/* Master Auto / Manual Mode & Quick Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Auto/Manual Mode Switch Button */}
                        <button
                            onClick={handleToggleBurnersMode}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                                burnersAutoMode
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            }`}
                        >
                            <i className={`fa-solid ${burnersAutoMode ? 'fa-microchip' : 'fa-hand'} text-sm`}></i>
                            <span>MODE: {burnersAutoMode ? 'AUTO (HEAT SHUT-OFF)' : 'MANUAL CONTROL'}</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => handleSetAllBurners('ON')}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold"
                            >
                                Ignite All (12)
                            </button>
                            <button
                                onClick={() => handleSetAllBurners('OFF')}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-rose-300 border border-slate-700 rounded-lg text-xs font-semibold"
                            >
                                Extinguish All
                            </button>
                        </div>
                    </div>
                </div>

                {/* Auto Thermal Governor Notice Banner */}
                <div className={`p-4 rounded-2xl mb-6 flex items-start gap-3 border transition-all ${
                    isOverheated 
                    ? 'bg-rose-950/80 border-rose-500 text-rose-200 animate-pulse' 
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}>
                    <i className={`fa-solid ${isOverheated ? 'fa-triangle-exclamation text-rose-400' : 'fa-temperature-arrow-down text-emerald-400'} text-xl mt-0.5`}></i>
                    <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between">
                            <strong className="uppercase font-bold tracking-wider">
                                {isOverheated ? '🚨 AUTO HEAT CUT-OFF ENGAGED' : 'AUTOMATIC THERMAL GOVERNOR ACTIVE'}
                            </strong>
                            <span className="font-mono text-slate-400">
                                Safe Threshold: <strong>&lt; 1,220 °C</strong> | Re-ignition: <strong>&lt; 1,080 °C</strong>
                            </span>
                        </div>
                        <p className="mt-1 text-slate-400 leading-relaxed">
                            {burnersAutoMode ? (
                                isOverheated ? (
                                    <span className="text-rose-300 font-bold">
                                        High furnace temperature (&gt;1,220°C) detected! Upper elevation burners (#9 to #12) have been automatically extinguished to protect boiler water walls. Burners will reignite when temperature stabilizes.
                                    </span>
                                ) : (
                                    'AUTOMATIC MODE ACTIVE: Automated safety governor continuously monitors boiler furnace temperature. If temperature exceeds 1,220°C, upper burners are automatically shut off to relieve thermal stress. Burners automatically reignite when temperature returns to safe operating threshold (<1,080°C).'
                                )
                            ) : (
                                'MANUAL OVERRIDE ACTIVE: Operator has direct manual command to modulate or toggle any individual corner burner independently.'
                            )}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-xs text-slate-400 uppercase font-semibold">Active Firing</div>
                        <div className="text-2xl font-black text-amber-400 font-mono">{activeBurnersCount} / 12</div>
                    </div>
                </div>

                {/* 12 BURNER CARDS GRID */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
                    {burners.map(b => {
                        const isOn = b.status === 'ON';
                        return (
                            <div 
                                key={b.id} 
                                className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                                    isOn 
                                    ? 'bg-slate-900/90 border-amber-500/60 shadow-lg shadow-amber-500/10' 
                                    : 'bg-slate-950/80 border-slate-800 opacity-70'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-mono font-bold text-slate-400">{b.corner}</span>
                                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                                            isOn 
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                                        }`}>
                                            {b.status}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                            isOn ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-800 text-slate-600'
                                        }`}>
                                            <i className="fa-solid fa-fire text-sm"></i>
                                        </div>
                                        <div>
                                            <h4 className="font-black text-white text-sm">{b.name}</h4>
                                            <span className="text-[10px] text-slate-500 block -mt-0.5">{b.elevation}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] font-mono space-y-1">
                                    <div className="flex justify-between text-slate-400">
                                        <span>Temp:</span>
                                        <span className="font-bold text-slate-200">{isOn ? `${b.temp_c}°C` : 'Cold'}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Fuel:</span>
                                        <span className="font-bold text-amber-400">{isOn ? `${b.gas_flow_scm} SCM` : '0 SCM'}</span>
                                    </div>
                                </div>

                                {/* Burner Toggle Button */}
                                <div className="mt-3">
                                    <button
                                        onClick={() => handleToggleBurner(b.id, b.status)}
                                        className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                            isOn 
                                            ? 'bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40' 
                                            : 'bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/40'
                                        }`}
                                    >
                                        <i className={`fa-solid ${isOn ? 'fa-power-off' : 'fa-play'} text-[10px]`}></i>
                                        <span>{isOn ? 'Turn OFF' : 'Ignite ON'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 2: SUBSYSTEMS & ROTATING EQUIPMENT */}
            {/* ========================================================================= */}
            <div className="scada-card p-6 border-t-4 border-t-sky-500">
                <div className="pb-4 mb-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-sky-400 bg-sky-950 px-3 py-1 rounded-full border border-sky-800">
                            Fleet Protection & Interlocks
                        </span>
                        <h2 className="text-2xl font-black text-white mt-2 flex items-center gap-2">
                            <i className="fa-solid fa-gears text-sky-500"></i>
                            Major Equipment Condition & Auto-Trip Controls
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                            Condition-based protection with automatic safety trip interlocks for critical rotating machinery.
                        </p>
                    </div>

                    <div className="text-xs text-slate-400 font-mono bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                        Protection Interlocks: <strong className="text-emerald-400">ACTIVE</strong>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {equipment.map(eq => {
                        const isRunning = eq.status === 'RUNNING';
                        const isAuto = eq.mode === 'AUTO';
                        const isTripped = eq.auto_tripped || eq.status === 'FAULT';

                        return (
                            <div 
                                key={eq.equipment_id} 
                                className={`p-5 rounded-2xl bg-slate-900 border transition-all flex flex-col justify-between ${
                                    isTripped 
                                    ? 'border-rose-500/80 shadow-lg shadow-rose-500/10' 
                                    : (isRunning ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800 opacity-75')
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] text-slate-500 font-bold">{eq.equipment_id}</span>
                                        <div className="flex items-center gap-2">
                                            {/* Auto / Manual Mode Pill */}
                                            <button
                                                onClick={() => handleEquipmentAction(eq.equipment_id, eq.status, eq.mode, 'mode')}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                                    isAuto 
                                                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                }`}
                                            >
                                                {isAuto ? 'AUTO' : 'MANUAL'}
                                            </button>

                                            {/* Status Badge */}
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                isTripped ? 'badge-critical' : (isRunning ? 'badge-normal' : 'badge-offline')
                                            }`}>
                                                ● {eq.status}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="text-lg font-black text-white mt-1.5">{eq.name}</h3>

                                    {/* Auto-Protected Alert Note */}
                                    {isTripped && (
                                        <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 font-semibold flex items-center gap-1.5">
                                            <i className="fa-solid fa-triangle-exclamation"></i>
                                            <span>Auto-Tripped: Over-limit Excursion</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-3 gap-2 my-4 pt-3 border-t border-slate-800 text-center">
                                    <div className="p-2 rounded-lg bg-slate-950">
                                        <span className="text-[10px] text-slate-500 block uppercase">Temperature</span>
                                        <span className="text-xs font-bold font-mono text-slate-200">{eq.temperature}°C</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-950">
                                        <span className="text-[10px] text-slate-500 block uppercase">Pressure</span>
                                        <span className="text-xs font-bold font-mono text-slate-200">{eq.pressure} bar</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-950">
                                        <span className="text-[10px] text-slate-500 block uppercase">Vibration</span>
                                        <span className="text-xs font-bold font-mono text-slate-200">{eq.vibration} mm/s</span>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                                    <div className="text-[11px] text-slate-400">
                                        Efficiency: <strong className="text-emerald-400">{eq.performance}%</strong>
                                    </div>

                                    {/* Machine ON/OFF Toggle Button */}
                                    <button
                                        onClick={() => handleEquipmentAction(eq.equipment_id, eq.status, eq.mode, 'status')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                            isRunning 
                                            ? 'bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40' 
                                            : 'bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/40'
                                        }`}
                                    >
                                        <i className={`fa-solid ${isRunning ? 'fa-stop' : 'fa-play'} text-[10px]`}></i>
                                        <span>{isRunning ? 'Stop Machine' : 'Start Machine'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ==============================================================================
// PAGE 5: ALERTS & ANOMALIES PAGE
// ==============================================================================
function AlertsPage() {
    const [alerts, setAlerts] = useState([]);
    const [filterSeverity, setFilterSeverity] = useState('ALL');

    const loadAlerts = () => {
        fetch('/api/alerts').then(r => r.json()).then(d => setAlerts(d)).catch(console.error);
    };

    useEffect(() => {
        loadAlerts();
        const interval = setInterval(loadAlerts, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleAcknowledge = async (id) => {
        await fetch('/api/alerts/acknowledge', {
            method: 'POST',
            body: JSON.stringify({ alert_id: id })
        });
        loadAlerts();
    };

    const handleResolve = async (id) => {
        await fetch('/api/alerts/resolve', {
            method: 'POST',
            body: JSON.stringify({ alert_id: id })
        });
        loadAlerts();
    };

    const filtered = alerts.filter(a => filterSeverity === 'ALL' || a.severity === filterSeverity);

    return (
        <div className="space-y-6">
            <div className="scada-card p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-4">
                    <div>
                        <h2 className="text-xl font-extrabold text-white">Alerts & Anomaly Incident Console</h2>
                        <p className="text-xs text-slate-400">Real-time safety limit breaches and automated diagnostic warnings.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {['ALL', 'CRITICAL', 'WARNING'].map(sev => (
                            <button
                                key={sev}
                                onClick={() => setFilterSeverity(sev)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                                    filterSeverity === sev ? 'bg-sky-500 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
                                }`}
                            >
                                {sev}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left scada-table">
                        <thead>
                            <tr>
                                <th>Incident ID</th>
                                <th>Sensor</th>
                                <th>Equipment</th>
                                <th>Anomaly Type</th>
                                <th>Severity</th>
                                <th>Reading vs Limit</th>
                                <th>Timestamp</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="text-center py-8 text-slate-500">
                                        No active alerts found matching current filter.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(a => {
                                    const isCrit = a.severity === 'CRITICAL';
                                    return (
                                        <tr key={a.id}>
                                            <td className="font-mono text-slate-400">#{a.id}</td>
                                            <td className="font-bold text-white">{a.sensor_name}</td>
                                            <td className="text-slate-300">{a.equipment_name}</td>
                                            <td className="text-xs font-bold text-amber-400">{a.alert_type}</td>
                                            <td>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isCrit ? 'badge-critical' : 'badge-warning'}`}>
                                                    {a.severity}
                                                </span>
                                            </td>
                                            <td className="font-mono text-xs text-white">
                                                <span className="text-rose-400 font-bold">{a.current_reading}</span> (Lim: {a.threshold_value})
                                            </td>
                                            <td className="text-slate-400 text-xs font-mono">{a.timestamp}</td>
                                            <td>
                                                <span className="text-[10px] font-bold uppercase text-slate-300">
                                                    {a.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    {a.status === 'ACTIVE' && (
                                                        <button 
                                                            onClick={() => handleAcknowledge(a.id)}
                                                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white text-[10px] font-bold border border-amber-500/30 transition"
                                                        >
                                                            Ack
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleResolve(a.id)}
                                                        className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white text-[10px] font-bold border border-emerald-500/30 transition"
                                                    >
                                                        Resolve
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ==============================================================================
// PAGE 6: HISTORICAL ANALYSIS PAGE
// ==============================================================================
function HistoricalAnalysisPage() {
    const [timeframe, setTimeframe] = useState('today');
    const [histData, setHistData] = useState([]);

    useEffect(() => {
        fetch(`/api/historical?timeframe=${timeframe}`)
            .then(r => r.json())
            .then(d => setHistData(d.records || []))
            .catch(console.error);
    }, [timeframe]);

    return (
        <div className="space-y-6">
            <div className="scada-card p-6">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                    <div>
                        <h2 className="text-xl font-extrabold text-white">Historical Performance Analytics</h2>
                        <p className="text-xs text-slate-400">Time-series data retrieved from SQLite historical tables.</p>
                    </div>

                    <div className="flex gap-2">
                        {['today', '7d', '30d'].map(tf => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                                    timeframe === tf ? 'bg-sky-500 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
                                }`}
                            >
                                {tf === 'today' ? 'Today' : (tf === '7d' ? 'Last 7 Days' : 'Last 30 Days')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left scada-table">
                        <thead>
                            <tr>
                                <th>Timeline</th>
                                <th>Electricity Generated</th>
                                <th>Natural Gas Burned</th>
                                <th>Water Consumed</th>
                                <th>Steam Generated</th>
                                <th>Plant Efficiency</th>
                            </tr>
                        </thead>
                        <tbody>
                            {histData.map((r, i) => (
                                <tr key={i}>
                                    <td className="font-mono text-sky-400 font-bold">{r.date || r.time}</td>
                                    <td className="font-mono text-white">{r.electricity_generated_mwh || r.electricity_mwh} MWh</td>
                                    <td className="font-mono text-white">{r.natural_gas_burned_scm || r.gas_scm} SCM</td>
                                    <td className="font-mono text-white">{r.water_consumed_kl || r.water_kl} KL</td>
                                    <td className="font-mono text-white">{r.steam_generated_tonnes || r.steam_tonnes} Tonnes</td>
                                    <td className="font-mono text-emerald-400 font-bold">{r.plant_efficiency_pct || r.efficiency}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ==============================================================================
// PAGE 7: 30-DAY PERFORMANCE DASHBOARD (REFERENCE IMAGE STYLE)
// ==============================================================================
function ThirtyDayPerformancePage() {
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        fetch('/api/thirty-day-summary').then(r => r.json()).then(d => setSummary(d)).catch(console.error);
    }, []);

    const totals = summary?.totals || {
        total_electricity_mwh: 348500.0,
        total_gas_scm: 65420000.0,
        total_water_kl: 1108800.0,
        total_steam_tonnes: 1069200.0
    };

    const stats = summary?.statistics || {
        avg_daily_generation_mwh: 11616.7,
        avg_plant_efficiency_pct: 41.25,
        max_daily_generation_mwh: 11950.0,
        min_daily_generation_mwh: 11200.0
    };

    const charts = summary?.daily_charts;

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="scada-card p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950 px-3 py-1 rounded-full border border-amber-800">
                            Monthly Audit Dashboard
                        </span>
                        <h2 className="text-2xl font-black text-white mt-2">30-Day Plant Performance Summary</h2>
                        <p className="text-xs text-slate-400 mt-1">Inspired by industrial operational logs for 500 MW base-load dispatch.</p>
                    </div>
                    <div className="text-right text-xs font-mono text-slate-400">
                        Date Range: Day 1 to Day 30 | Base-load Factor: 96.8%
                    </div>
                </div>
            </div>

            {/* 4 MAIN KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="scada-card p-5 border-t-4 border-t-sky-500">
                    <span className="text-xs font-bold uppercase text-slate-400">Total Electricity Generated</span>
                    <div className="text-3xl font-black text-sky-400 mt-2">{totals.total_electricity_mwh.toLocaleString()} <span className="text-xs font-normal text-slate-400">MWh</span></div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Monthly Delivered Energy</span>
                </div>

                <div className="scada-card p-5 border-t-4 border-t-amber-500">
                    <span className="text-xs font-bold uppercase text-slate-400">Total Natural Gas Burned</span>
                    <div className="text-3xl font-black text-amber-400 mt-2">{totals.total_gas_scm.toLocaleString()} <span className="text-xs font-normal text-slate-400">SCM</span></div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Total Fuel Consumed</span>
                </div>

                <div className="scada-card p-5 border-t-4 border-t-blue-500">
                    <span className="text-xs font-bold uppercase text-slate-400">Total Water Consumed</span>
                    <div className="text-3xl font-black text-blue-400 mt-2">{totals.total_water_kl.toLocaleString()} <span className="text-xs font-normal text-slate-400">KL</span></div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Cooling & Feedwater</span>
                </div>

                <div className="scada-card p-5 border-t-4 border-t-indigo-500">
                    <span className="text-xs font-bold uppercase text-slate-400">Total Steam Generated</span>
                    <div className="text-3xl font-black text-indigo-400 mt-2">{totals.total_steam_tonnes.toLocaleString()} <span className="text-xs font-normal text-slate-400">Tonnes</span></div>
                    <span className="text-[11px] text-slate-500 mt-1 block">High-Pressure Steam</span>
                </div>
            </div>

            {/* 4 DISTINCT 30-DAY CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Daily Electricity Generation */}
                <div className="scada-card p-5">
                    <h3 className="text-xs font-bold text-slate-300 uppercase mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-chart-column text-sky-400"></i>
                        1. Daily Electricity Generation (Day 1 to Day 30) [MWh]
                    </h3>
                    <div className="h-64">
                        {charts && <DailyBarChart labels={charts.days} values={charts.electricity_generation} color="#38bdf8" label="MWh" />}
                    </div>
                </div>

                {/* Chart 2: Daily Natural Gas Consumption */}
                <div className="scada-card p-5">
                    <h3 className="text-xs font-bold text-slate-300 uppercase mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-fire text-amber-400"></i>
                        2. Daily Natural Gas Consumption (SCM)
                    </h3>
                    <div className="h-64">
                        {charts && <DailyBarChart labels={charts.days} values={charts.gas_consumption} color="#f59e0b" label="SCM" />}
                    </div>
                </div>

                {/* Chart 3: Water Consumed vs Steam Generated */}
                <div className="scada-card p-5">
                    <h3 className="text-xs font-bold text-slate-300 uppercase mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-scale-balanced text-indigo-400"></i>
                        3. Water Consumed vs Steam Generated
                    </h3>
                    <div className="h-64">
                        {charts && <WaterSteamComparisonChart labels={charts.days} water={charts.water_consumed} steam={charts.steam_generated} />}
                    </div>
                </div>

                {/* Chart 4: Daily Trend: Gas Consumption vs Electricity Generation */}
                <div className="scada-card p-5">
                    <h3 className="text-xs font-bold text-slate-300 uppercase mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-chart-line text-emerald-400"></i>
                        4. Daily Trend: Gas Consumption vs Electricity Generation
                    </h3>
                    <div className="h-64">
                        {charts && <GasElectricityTrendChart labels={charts.days} elec={charts.electricity_generation} gas={charts.gas_consumption} />}
                    </div>
                </div>
            </div>

            {/* Statistics Table */}
            <div className="scada-card p-5">
                <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Key 30-Day Operational Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="p-3 bg-slate-900 rounded-lg">
                        <span className="text-slate-500 block">Daily Average Generation:</span>
                        <strong className="text-white text-sm">{stats.avg_daily_generation_mwh.toLocaleString()} MWh</strong>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg">
                        <span className="text-slate-500 block">Average Thermodynamic Efficiency:</span>
                        <strong className="text-emerald-400 text-sm">{stats.avg_plant_efficiency_pct}%</strong>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg">
                        <span className="text-slate-500 block">Max Daily Generation:</span>
                        <strong className="text-sky-400 text-sm">{stats.max_daily_generation_mwh.toLocaleString()} MWh</strong>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg">
                        <span className="text-slate-500 block">Min Daily Generation:</span>
                        <strong className="text-slate-300 text-sm">{stats.min_daily_generation_mwh.toLocaleString()} MWh</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}

// 30-DAY CHART HELPERS
function DailyBarChart({ labels, values, color, label }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: values,
                    backgroundColor: color,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 15 } },
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } }
                },
                plugins: { legend: { display: false } }
            }
        });
        return () => chart.destroy();
    }, [labels, values, color, label]);
    return <canvas ref={canvasRef} />;
}

function WaterSteamComparisonChart({ labels, water, steam }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Water (KL)', data: water, borderColor: '#38bdf8', borderWidth: 2, tension: 0.3, pointRadius: 0 },
                    { label: 'Steam (Tonnes)', data: steam, borderColor: '#a855f7', borderWidth: 2, tension: 0.3, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 15 } },
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }
            }
        });
        return () => chart.destroy();
    }, [labels, water, steam]);
    return <canvas ref={canvasRef} />;
}

function GasElectricityTrendChart({ labels, elec, gas }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Electricity (MWh)', data: elec, borderColor: '#10b981', yAxisID: 'y1', borderWidth: 2, tension: 0.3, pointRadius: 0 },
                    { label: 'Gas (SCM)', data: gas, borderColor: '#f59e0b', yAxisID: 'y2', borderWidth: 2, tension: 0.3, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 15 } },
                    y1: { type: 'linear', position: 'left', grid: { color: '#1e293b' }, ticks: { color: '#10b981', font: { size: 9 } } },
                    y2: { type: 'linear', position: 'right', grid: { display: false }, ticks: { color: '#f59e0b', font: { size: 9 } } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }
            }
        });
        return () => chart.destroy();
    }, [labels, elec, gas]);
    return <canvas ref={canvasRef} />;
}

// Mount React Root
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
