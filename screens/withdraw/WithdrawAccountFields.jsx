import { View, Text } from 'react-native'

import QPInput from '../../ui/particles/QPInput'

const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Dynamic "account data" inputs driven by the selected coin's working_data fields.
const WithdrawAccountFields = ({ workingFields, workingForm, onChangeField, theme, textStyles }) => (
	<View style={{ marginTop: 20 }}>
		<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>Datos de su cuenta:</Text>
		{workingFields.map((field) => {
			const key = keyFromFieldName(field.name)
			return (
				<QPInput
					key={key}
					value={workingForm[key] || ''}
					onChangeText={(text) => onChangeField(key, text)}
					placeholder={field.name}
					keyboardType={field.type === 'number' ? 'numeric' : 'default'}
					style={{ marginVertical: 6 }}
					prefixIconName="id-card"
				/>
			)
		})}
	</View>
)

export default WithdrawAccountFields
