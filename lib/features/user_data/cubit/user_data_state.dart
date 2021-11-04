part of 'user_data_cubit.dart';

class UserDataState extends Equatable {
  const UserDataState({
    this.userData,
    this.errorMessage,
    this.isStateLoading = true,
  });

  final UserData? userData;
  final String? errorMessage;
  final bool isStateLoading;

  @override
  List<Object?> get props => [userData, errorMessage, isStateLoading];

  UserDataState copyWith({
    UserData? userData,
    String? errorMessage,
    bool? isStateLoading,
  }) {
    return UserDataState(
      userData: userData ?? this.userData,
      errorMessage: errorMessage ?? this.errorMessage,
      isStateLoading: isStateLoading ?? this.isStateLoading,
    );
  }
}
