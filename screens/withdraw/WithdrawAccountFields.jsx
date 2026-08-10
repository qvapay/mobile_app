import { View, Text } from 'react-native'

import QPInput from '../../ui/particles/QPInput'

const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Dynamic "account data" inputs driven by the selected coin's working_data fields.
// `multilineKeys` marks fields (by slugified key) that hold long payloads — e.g. the
// BTCLN wallet field with a BOLT11 invoice — so they wrap instead of scrolling, and
// disable autocapitalize/autocorrect that would corrupt them.
const WithdrawAccountFields = ({ workingFields, workingForm, onChangeField, multilineKeys = [], theme, textStyles }) => (
	<View style={{ marginTop: 20 }}>
		<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>Datos de su cuenta:</Text>
		{workingFields.map((field) => {
			const key = keyFromFieldName(field.name)
			const isMultiline = multilineKeys.includes(key)
			return (
				<QPInput
					key={key}
					value={workingForm[key] || ''}
					onChangeText={(text) => onChangeField(key, text)}
					placeholder={field.name}
					keyboardType={field.type === 'number' ? 'numeric' : 'default'}
					style={{ marginVertical: 6 }}
					prefixIconName={isMultiline ? 'bolt' : 'id-card'}
					{...(isMultiline && { multiline: true, autoCapitalize: 'none', autoCorrect: false })}
				/>
			)
		})}
	</View>
)

export default WithdrawAccountFields
