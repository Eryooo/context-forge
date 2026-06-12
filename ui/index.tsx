import { installDiag } from './diag'
installDiag() // Spike 调试用,定稿删除

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import './App.css'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'

ReactDOM.render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
    document.getElementById('root')
)
