import 'package:equatable/equatable.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

part 'user_data_state.dart';

class UserDataCubit extends HydratedCubit<UserDataState> {
  UserDataCubit({
    required IUserDataRepository userDataRepository,
  })  : _userDataRepository = userDataRepository,
        super(const UserDataState());

  final IUserDataRepository _userDataRepository;

  Future<void> getUserData({required DateTime saveDateLastLogIn}) async {
    emit(state.copyWith(isStateLoading: true, errorMessage: '*'));
    final result = await _userDataRepository.getUserData(
      saveDateLastLogIn: saveDateLastLogIn,
    );

    emit(
      result.fold(
        (failure) => state.copyWith(
          userData: state.userData,
          isStateLoading: false,
          errorMessage: (failure is ServerFailure)
              ? failure.message
              : const AuthenticationFailure().message,
        ),
        (userData) => state.copyWith(userData: userData, isStateLoading: false),
      ),
    );
  }

  @override
  UserDataState? fromJson(Map<String, dynamic> json) {
    if (json.isEmpty) {
      return UserDataState(
        errorMessage: 'Empty Cache',
        userData: state.userData,
      );
    }
    return UserDataState(userData: UserData.fromJson(json));
  }

  @override
  Map<String, dynamic>? toJson(UserDataState state) {
    if (state.userData != null) {
      return state.userData?.toJson();
    }
    return <String, dynamic>{};
  }
}
